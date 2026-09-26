<?php

namespace App\Domain\Shipment\Services;

use App\Domain\Shared\Models\AuditLog;
use App\Domain\Shipment\Enums\ShipmentStatus;
use App\Domain\Shipment\Models\CustodyEvent;
use App\Domain\Shipment\Models\CustodyTransferRequest;
use App\Domain\Shipment\Models\DeliveryAttempt;
use App\Domain\Shipment\Models\Shipment;
use App\Domain\Shipment\Models\ShipmentEvent;
use App\Domain\Shipment\Models\ShipmentEvidence;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Historial unificado y legible de un paquete (contrato 2026-09-26 §1).
 *
 * Fusiona cinco fuentes: cambios de estado (shipment_events), custodia
 * (custody_events), intentos de entrega con sus fotos (delivery_attempts),
 * fotos agregadas después (shipment_evidence sueltas o `late_photo`) y la
 * bitácora financiera del envío (audit_logs). Orden cronológico ascendente.
 *
 * Deduplicación: un cambio de estado que dice lo mismo que un evento de
 * custodia o un intento de entrega dentro de ±2 minutos se muestra una sola
 * vez (gana la custodia o el intento, que tienen más detalle). Los eventos de
 * custodia de entrega/novedad se absorben en su intento de entrega.
 */
class ShipmentTimelineService
{
    private const DEDUPE_SECONDS = 120;

    /** Orden estable cuando dos entradas caen en el mismo segundo. */
    private const SOURCE_PRIORITY = ['status' => 0, 'transfer' => 1, 'custody' => 2, 'attempt' => 3, 'evidence' => 4, 'audit' => 5];

    /** Significados equivalentes entre un cambio de estado y la custodia. */
    private const EQUIVALENT_KINDS = [
        'received_hub' => ['received_hub', 'returned_by_driver', 'back_to_hub', 'return_confirmed'],
        'back_to_hub' => ['back_to_hub', 'returned_by_driver', 'received_hub', 'return_confirmed'],
        'handed_to_driver' => ['handed_to_driver', 'transferred'],
        'delivered' => ['delivered'],
        'delivery_failed' => ['delivery_failed'],
    ];

    /** @return list<array<string, mixed>> */
    public function build(Shipment $shipment): array
    {
        $shipment->loadMissing([
            'events.user:id,name',
            'custodyEvents.actor:id,name',
            'deliveryAttempts.driver:id,name',
            'evidence.createdBy:id,name',
        ]);

        $attempts = $shipment->deliveryAttempts;
        $evidence = $shipment->evidence;
        $attemptIds = $attempts->pluck('id')->map(fn ($id) => (int) $id)->all();

        $entries = collect()
            ->merge($this->attemptEntries($attempts, $evidence))
            ->merge($this->custodyEntries($shipment->custodyEvents, $attemptIds))
            ->merge($this->looseEvidenceEntries($evidence, $attemptIds))
            ->merge($this->auditEntries($shipment))
            ->merge($this->transferRequestEntries($shipment));

        $statusEntries = $this->statusEntries($shipment->events)
            ->reject(fn (array $entry) => $this->isDuplicatedByRicherSource($entry, $entries));

        return $entries->merge($statusEntries)
            ->sort(function (array $a, array $b): int {
                return [$a['_at']->getTimestamp(), self::SOURCE_PRIORITY[$a['_source']], $a['_order']]
                    <=> [$b['_at']->getTimestamp(), self::SOURCE_PRIORITY[$b['_source']], $b['_order']];
            })
            ->map(fn (array $entry) => $this->present($entry))
            ->values()
            ->all();
    }

    /** @param Collection<int, ShipmentEvent> $events */
    private function statusEntries(Collection $events): Collection
    {
        return $events->map(function (ShipmentEvent $event) {
            $to = ShipmentStatus::tryFrom((string) $event->to_status);
            $from = ShipmentStatus::tryFrom((string) $event->from_status);
            $metadata = is_array($event->metadata) ? $event->metadata : [];
            [$kind, $title] = $this->statusKindAndTitle($from, $to, $event, $metadata);

            return $this->entry('status', (int) $event->id, $event->occurred_at ?? $event->created_at, $kind, $title, [
                'detail' => $this->cleanDetail($event->description, $title),
                'actor' => $event->user?->name,
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array{0:string,1:string}
     */
    private function statusKindAndTitle(?ShipmentStatus $from, ?ShipmentStatus $to, ShipmentEvent $event, array $metadata): array
    {
        if (($metadata['action'] ?? null) === 'route_stop_removed') {
            return ['status_change', 'Retirado de la ruta'];
        }

        if ($from === null && in_array($to, [ShipmentStatus::REGISTERED, ShipmentStatus::CONFIRMED, null], true)) {
            return ['created', 'Envío creado'];
        }

        return match ($to) {
            ShipmentStatus::IN_WAREHOUSE => in_array($from, [ShipmentStatus::HANDED_TO_DRIVER, ShipmentStatus::ASSIGNED_TO_ROUTE, ShipmentStatus::IN_TRANSIT, ShipmentStatus::ISSUE], true)
                ? ['back_to_hub', 'Devuelto a bodega']
                : ['received_hub', 'Recibido en bodega'],
            ShipmentStatus::HANDED_TO_DRIVER => ['handed_to_driver', 'Entregado al piloto'],
            ShipmentStatus::ASSIGNED_TO_ROUTE => ['route_assigned', 'Asignado a ruta'],
            ShipmentStatus::IN_TRANSIT => ['in_transit', 'Salió a reparto'],
            ShipmentStatus::DELIVERED => ['delivered', 'Entregado al destinatario'],
            ShipmentStatus::ISSUE => ['delivery_failed', 'No se pudo entregar'],
            ShipmentStatus::RETURNED => ['returned_sender', 'Devuelto al remitente'],
            ShipmentStatus::CANCELLED => ['cancelled', 'Envío cancelado'],
            default => ['status_change', $to ? 'Estado: '.$to->label() : 'Cambio de estado'],
        };
    }

    /**
     * @param  Collection<int, CustodyEvent>  $events
     * @param  list<int>  $attemptIds
     */
    private function custodyEntries(Collection $events, array $attemptIds): Collection
    {
        return $events
            ->reject(function (CustodyEvent $event) use ($attemptIds) {
                // La entrega y la novedad ya las cuenta su intento (con fotos).
                $attemptId = (int) ($event->metadata_json['delivery_attempt_id'] ?? 0);

                return in_array($event->event_type, ['delivery_completed', 'delivery_attempt_failed'], true)
                    && in_array($attemptId, $attemptIds, true);
            })
            ->map(function (CustodyEvent $event) {
                $from = $this->custodianName($event->previous_custodian_type, $event->previous_custodian_name, $event->previous_custodian_id);
                $to = $this->custodianName($event->new_custodian_type, $event->new_custodian_name, $event->new_custodian_id);
                [$kind, $title] = $this->custodyKindAndTitle($event, $from, $to);

                $detailParts = [];
                if ($event->actor?->name) {
                    $detailParts[] = 'Escaneado por '.$event->actor->name;
                }
                if ($condition = $this->conditionLabel($event->physical_condition)) {
                    $detailParts[] = 'condición: '.$condition;
                }
                if ($note = $event->metadata_json['note'] ?? $event->metadata_json['notes'] ?? $event->metadata_json['reason'] ?? null) {
                    $detailParts[] = (string) $note;
                }
                if (! empty($event->metadata_json['transfer_request_id'])) {
                    $detailParts[] = ($event->metadata_json['accepted_via'] ?? null) === 'admin'
                        ? 'Aprobado por administración'.(($admin = $event->metadata_json['accepted_by_name'] ?? null) ? " ({$admin})" : '')
                        : ($from ? "{$from} aceptó" : 'El piloto anterior aceptó');
                }

                return $this->entry('custody', (int) $event->id, $event->occurred_at, $kind, $title, [
                    'detail' => $detailParts === [] ? null : implode(' · ', $detailParts),
                    'actor' => $event->actor?->name,
                    'from' => $from,
                    'to' => $to,
                ]);
            });
    }

    /** @return array{0:string,1:string} */
    private function custodyKindAndTitle(CustodyEvent $event, ?string $from, ?string $to): array
    {
        return match ($event->event_type) {
            'received_at_hub', 'collector_handover_to_hub' => ['received_hub', 'Recibido en bodega'],
            'picked_up_from_client' => ['status_change', $to ? "Recogido por {$to}" : 'Recogido donde el cliente'],
            'assigned_to_driver' => ['handed_to_driver', $to ? "Entregado a {$to}" : 'Entregado al piloto'],
            'custody_transferred' => ['transferred', $from && $to ? "Pasó de {$from} a {$to}" : 'Cambió de piloto'],
            'returned_by_driver' => ['returned_by_driver', $from ? "{$from} lo devolvió a bodega" : 'Devuelto a bodega por el piloto'],
            'warehouse_return', 'return_received_at_hub' => ['back_to_hub', 'Devuelto a bodega'],
            'return_confirmed_at_hub' => ['return_confirmed', 'Bodega confirmó la devolución'],
            'return_completed_to_client' => ['returned_sender', 'Devuelto al remitente'],
            'delivery_completed' => ['delivered', 'Entregado al destinatario'],
            'delivery_attempt_failed' => ['delivery_failed', 'No se pudo entregar'],
            default => ['status_change', $to ? "Quedó a cargo de {$to}" : 'Movimiento de custodia'],
        };
    }

    /**
     * @param  Collection<int, DeliveryAttempt>  $attempts
     * @param  Collection<int, ShipmentEvidence>  $evidence
     */
    private function attemptEntries(Collection $attempts, Collection $evidence): Collection
    {
        return $attempts->map(function (DeliveryAttempt $attempt) use ($evidence) {
            $delivered = $attempt->status?->value === 'delivered' || $attempt->result_code === 'delivered';
            $photos = $evidence
                ->filter(fn (ShipmentEvidence $item) => (int) $item->delivery_attempt_id === (int) $attempt->id
                    && $item->evidence_type !== 'late_photo')
                ->values();

            if ($delivered) {
                $title = 'Entregado al destinatario';
                $detail = $attempt->recipient_name ? 'Recibió: '.$attempt->recipient_name : null;
            } else {
                $reason = $this->failureReason($attempt);
                $title = $reason ? "No se pudo entregar: {$reason}" : 'No se pudo entregar';
                $detail = null;
            }

            return $this->entry('attempt', (int) $attempt->id, $attempt->finished_at ?? $attempt->created_at, $delivered ? 'delivered' : 'delivery_failed', $title, [
                'detail' => $detail,
                'actor' => $attempt->driver?->name,
                'photos' => $photos,
            ]);
        });
    }

    /**
     * Fotos agregadas después (`late_photo`) o sin intento: una entrada por
     * envío de fotos (mismo actor, mismo minuto).
     *
     * @param  Collection<int, ShipmentEvidence>  $evidence
     * @param  list<int>  $attemptIds
     */
    private function looseEvidenceEntries(Collection $evidence, array $attemptIds): Collection
    {
        return $evidence
            ->filter(fn (ShipmentEvidence $item) => $item->evidence_type === 'late_photo'
                || $item->delivery_attempt_id === null
                || ! in_array((int) $item->delivery_attempt_id, $attemptIds, true))
            ->groupBy(fn (ShipmentEvidence $item) => ($item->created_by ?? 'x').'|'.$this->asCarbon($item->received_at ?? $item->created_at)?->format('YmdHi'))
            ->map(function (Collection $group) {
                /** @var ShipmentEvidence $first */
                $first = $group->sortBy('id')->first();
                $note = $group->map(fn (ShipmentEvidence $item) => $item->metadata_json['note'] ?? null)->filter()->first();
                $count = $group->count();

                return $this->entry('evidence', (int) $first->id, $first->received_at ?? $first->created_at, 'photo_added', $count > 1 ? "{$count} fotos agregadas" : 'Foto agregada', [
                    'detail' => $note,
                    'actor' => $first->createdBy?->name ?? ($first->metadata_json['actor_name'] ?? null),
                    'photos' => $group->sortBy('id')->values(),
                ]);
            })
            ->values();
    }

    /**
     * Solicitudes de traspaso con aceptación (contrato 2026-09-26-B §1). La
     * aceptación no se repite aquí: se ve en el `transferred` de custodia.
     */
    private function transferRequestEntries(Shipment $shipment): Collection
    {
        $entries = collect();

        CustodyTransferRequest::query()
            ->with(['respondedBy:id,name', 'requestedBy:id,name'])
            ->where('shipment_id', $shipment->id)
            ->orderBy('id')
            ->get()
            ->each(function (CustodyTransferRequest $request) use ($entries) {
                $from = $this->custodianName('driver', null, $request->from_driver_id);
                $to = $this->custodianName('driver', null, $request->to_driver_id);

                $entries->push(['id' => "transfer_request:{$request->id}"] + $this->entry('transfer', (int) $request->id * 2, $request->requested_at ?? $request->created_at, 'transfer_requested', "{$to} pidió el paquete a {$from}", [
                    'detail' => $request->isPending() && ! $request->isOverdue() ? "Esperando que {$from} acepte" : null,
                    'actor' => $request->requestedBy?->name ?? $to,
                    'from' => $from,
                    'to' => $to,
                ]));

                if ($request->status === CustodyTransferRequest::REJECTED) {
                    $byAdmin = ($request->metadata_json['rejected_via'] ?? null) === 'admin';
                    $parts = array_filter([
                        $request->reason ? 'Motivo: '.$request->reason : null,
                        $byAdmin ? 'Rechazado por administración'.($request->respondedBy?->name ? " ({$request->respondedBy->name})" : '') : null,
                    ]);
                    $entries->push(['id' => "transfer_response:{$request->id}"] + $this->entry('transfer', (int) $request->id * 2 + 1, $request->responded_at ?? $request->updated_at, 'transfer_rejected',
                        $byAdmin ? 'Administración no aceptó el cambio' : "{$from} no aceptó el cambio", [
                            'detail' => $parts === [] ? null : implode(' · ', $parts),
                            'actor' => $request->respondedBy?->name,
                            'from' => $from,
                            'to' => $to,
                        ]));
                } elseif ($request->status === CustodyTransferRequest::EXPIRED || $request->isOverdue()) {
                    $entries->push(['id' => "transfer_response:{$request->id}"] + $this->entry('transfer', (int) $request->id * 2 + 1, $request->expires_at ?? $request->responded_at, 'transfer_expired', 'La solicitud venció', [
                        'detail' => "{$from} no respondió a tiempo",
                        'from' => $from,
                        'to' => $to,
                    ]));
                }
            });

        return $entries;
    }

    private function auditEntries(Shipment $shipment): Collection
    {
        $titles = [
            'financial.collect' => ['cod_collected', 'Recaudo contra entrega registrado'],
            'financial.settle' => ['cod_settled', 'Recaudo liquidado a la oficina'],
            'financial.driver_paid' => ['driver_paid', 'Pago al piloto registrado'],
        ];

        return AuditLog::query()
            ->with('user:id,name')
            ->where('entity_type', class_basename(Shipment::class))
            ->where('entity_id', $shipment->id)
            ->whereIn('action', array_keys($titles))
            ->orderBy('id')
            ->get()
            ->map(function (AuditLog $log) use ($titles) {
                [$kind, $title] = $titles[$log->action];

                return $this->entry('audit', (int) $log->id, $log->occurred_at ?? $log->created_at, $kind, $title, [
                    'detail' => $log->description,
                    'actor' => $log->user?->name,
                ]);
            });
    }

    /**
     * @param  array<string, mixed>  $entry
     * @param  Collection<int, array<string, mixed>>  $richer
     */
    private function isDuplicatedByRicherSource(array $entry, Collection $richer): bool
    {
        $equivalents = self::EQUIVALENT_KINDS[$entry['kind']] ?? null;
        if ($equivalents === null) {
            return false;
        }

        return $richer->contains(fn (array $other) => in_array($other['_source'], ['custody', 'attempt'], true)
            && in_array($other['kind'], $equivalents, true)
            && abs($other['_at']->getTimestamp() - $entry['_at']->getTimestamp()) <= self::DEDUPE_SECONDS);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function entry(string $source, int $id, mixed $at, string $kind, string $title, array $extra = []): array
    {
        return [
            '_source' => $source,
            '_order' => $id,
            '_at' => $this->asCarbon($at) ?? Carbon::createFromTimestamp(0),
            'id' => "{$source}:{$id}",
            'kind' => $kind,
            'title' => $title,
            'detail' => $extra['detail'] ?? null,
            'actor' => $extra['actor'] ?? null,
            'from' => $extra['from'] ?? null,
            'to' => $extra['to'] ?? null,
            'photos' => $extra['photos'] ?? collect(),
        ];
    }

    /**
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    private function present(array $entry): array
    {
        return [
            'id' => $entry['id'],
            'at' => $entry['_at']->copy()->setTimezone(config('app.timezone'))->toIso8601String(),
            'kind' => $entry['kind'],
            'title' => $entry['title'],
            'detail' => $entry['detail'],
            'actor' => $entry['actor'],
            'from' => $entry['from'],
            'to' => $entry['to'],
            'photos' => collect($entry['photos'])->map(fn (ShipmentEvidence $photo) => [
                'id' => (int) $photo->id,
                'url' => $photo->url,
                'type' => $photo->evidence_type,
            ])->values()->all(),
        ];
    }

    private function custodianName(?string $type, ?string $name, mixed $id): ?string
    {
        return match ($type) {
            null => null,
            'hub' => 'Bodega',
            'driver' => app(CustodyGuard::class)->driverName($id ? (int) $id : null, $name),
            'recipient' => $name ?: 'Destinatario',
            'client' => $name ?: 'Cliente',
            default => $name ?: null,
        };
    }

    private function conditionLabel(?string $condition): ?string
    {
        return match ($condition) {
            null, '' => null,
            'intact', 'good' => 'buena',
            'observed_damage', 'damaged' => 'con daño',
            'unknown' => 'sin revisar',
            default => $condition,
        };
    }

    private function failureReason(DeliveryAttempt $attempt): ?string
    {
        $note = trim((string) $attempt->notes);
        if ($note !== '') {
            return $note;
        }

        $code = (string) $attempt->failure_cause_code;

        return $code !== '' && $code !== 'unspecified' ? str_replace('_', ' ', $code) : null;
    }

    private function cleanDetail(?string $description, string $title): ?string
    {
        $description = trim((string) $description);

        if ($description === '' || $description === $title || str_starts_with($description, 'Estado cambiado a ')) {
            return null;
        }

        return $description;
    }

    private function asCarbon(mixed $value): ?CarbonInterface
    {
        if ($value instanceof CarbonInterface) {
            return $value;
        }

        return $value ? Carbon::parse((string) $value) : null;
    }
}
