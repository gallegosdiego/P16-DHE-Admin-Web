<?php

namespace App\Domain\Operations\Services;

use Illuminate\Support\Facades\Schema;

class OperationalIntakeSchema
{
    /** @var array<string, list<string>> */
    private const REQUIRED_COLUMNS = [
        'service_locations' => [
            'code',
            'name',
            'address_line1',
            'city',
            'is_active',
        ],
        'pickup_requests' => [
            'pickup_code',
            'customer_id',
            'source',
            'intake_mode',
            'service_location_id',
            'planned_dropoff_at',
            'status',
            'pickup_address_line1',
            'contact_name',
            'contact_phone',
            'pickup_window_code',
            'pickup_window_label',
            'package_count',
            'requested_cod_total',
            'correlation_id',
            'submitted_at',
            'accepted_at',
            'ready_for_assignment_at',
        ],
        'pickup_packages' => [
            'pickup_request_id',
            'package_index',
            'recipient_name',
            'recipient_phone',
            'delivery_address_line1',
            'delivery_city',
            'is_cod',
            'requested_cod_amount',
            'shipment_id',
            'guide_number',
            'qr_reference',
        ],
        'pickup_review_events' => [
            'pickup_request_id',
            'event_type',
            'notes',
            'old_values_json',
            'new_values_json',
            'actor_type',
            'actor_id',
            'occurred_at',
        ],
        'operational_tasks' => [
            'task_code',
            'task_type',
            'status',
            'customer_id',
            'pickup_request_id',
            'shipment_id',
            'service_location_id',
            'assignee_type',
            'assigned_driver_id',
            'assigned_user_id',
            'assigned_executor_name',
            'assigned_executor_phone',
            'assigned_at',
            'accepted_at',
            'started_at',
            'completed_at',
        ],
        'pickup_batches' => [
            'batch_code',
            'pickup_request_id',
            'operational_task_id',
            'service_location_id',
            'driver_id',
            'intake_mode',
            'status',
            'executor_type',
            'executor_name',
            'delivered_by_name',
            'delivered_by_phone',
            'delivered_by_relationship',
            'received_by',
            'expected_packages',
            'received_packages',
            'rejected_packages',
            'missing_packages',
            'arrived_at',
            'completed_at',
            'notes',
        ],
        'pickup_batch_items' => [
            'pickup_batch_id',
            'pickup_package_id',
            'shipment_id',
            'item_reference',
            'result',
            'exception_code',
            'exception_notes',
            'verified_at',
            'verified_by',
        ],
        'delivery_attempts' => [
            'shipment_id',
            'operational_task_id',
            'driver_id',
            'attempt_number',
            'status',
        ],
        'shipment_evidence' => [
            'shipment_id',
            'operational_task_id',
            'evidence_type',
            'original_path',
            'sha256',
        ],
        'custody_events' => [
            'shipment_id',
            'operational_task_id',
            'event_type',
            'previous_custodian_type',
            'previous_custodian_id',
            'previous_custodian_name',
            'new_custodian_type',
            'new_custodian_id',
            'new_custodian_name',
            'actor_user_id',
            'occurred_at',
        ],
        'idempotency_records' => [
            'scope',
            'idempotency_key',
            'operation',
            'request_hash',
            'status',
            'result_type',
            'result_id',
            'completed_at',
        ],
    ];

    /**
     * @return array{
     *     tables: array<string, bool>,
     *     columns: array<string, array<string, bool>>,
     *     ready: bool
     * }
     */
    public function inspect(): array
    {
        $tables = [];
        $columns = [];
        $ready = true;

        foreach (self::REQUIRED_COLUMNS as $table => $requiredColumns) {
            $tableExists = Schema::hasTable($table);
            $tables[$table] = $tableExists;
            $columns[$table] = [];
            $availableColumns = $tableExists
                ? array_fill_keys(Schema::getColumnListing($table), true)
                : [];

            foreach ($requiredColumns as $column) {
                $exists = isset($availableColumns[$column]);
                $columns[$table][$column] = $exists;
                $ready = $ready && $exists;
            }

            $ready = $ready && $tableExists;
        }

        return [
            'tables' => $tables,
            'columns' => $columns,
            'ready' => $ready,
        ];
    }

    public function isReady(): bool
    {
        return $this->inspect()['ready'];
    }
}
