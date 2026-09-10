<?php

namespace App\Domain\Pickup\Enums;

/**
 * Las jornadas en las que Danhei sale a recoger.
 *
 * Hasta ahora la ventana nacía como "por confirmar" y nadie la editaba: el
 * cliente no elegía cuándo y la operación no podía prometer una franja. Estas
 * son las dos jornadas del día, más el ingreso inmediato del mostrador.
 *
 * Las horas son las vigentes al 10/09/2026; si la operación cambia, se cambian
 * aquí y el portal las refleja solo.
 */
enum PickupWindow: string
{
    case MORNING = 'MORNING';
    case AFTERNOON = 'AFTERNOON';
    case TO_CONFIRM = 'TO_CONFIRM';
    case NOW = 'NOW';

    public function label(): string
    {
        return match ($this) {
            self::MORNING => 'Mañana (8:00 a 12:00)',
            self::AFTERNOON => 'Tarde (1:00 a 5:00)',
            self::TO_CONFIRM => 'Por confirmar',
            self::NOW => 'Ingreso inmediato',
        };
    }

    /** Las que el cliente puede elegir al pedir una recogida. */
    public static function seleccionables(): array
    {
        return [self::MORNING, self::AFTERNOON];
    }

    /** @return array<int, array{code: string, label: string}> */
    public static function catalogoParaPortal(): array
    {
        return array_map(
            fn (self $window) => ['code' => $window->value, 'label' => $window->label()],
            self::seleccionables(),
        );
    }
}
