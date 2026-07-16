<?php

namespace App\Domain\Operations\Exceptions;

use RuntimeException;

class OperationalIntakeUnavailable extends RuntimeException
{
    /**
     * @param  list<string>  $missingTables
     * @param  list<string>  $missingColumns
     */
    public function __construct(
        public readonly array $missingTables,
        public readonly array $missingColumns,
    ) {
        parent::__construct(
            'El módulo de ingreso aún no está listo en el servidor. Debe completarse la actualización de la base de datos.',
        );
    }
}
