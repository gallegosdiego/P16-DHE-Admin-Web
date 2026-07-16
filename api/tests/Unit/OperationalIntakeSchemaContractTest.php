<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class OperationalIntakeSchemaContractTest extends TestCase
{
    public function test_runtime_and_pre_copy_guards_use_the_same_column_contract(): void
    {
        $repositoryRoot = dirname(__DIR__, 3);
        $runtimeContract = $this->extractArrayLiteral(
            $this->readFile(
                $repositoryRoot.'/api/app/Domain/Operations/Services/OperationalIntakeSchema.php',
            ),
            'private const REQUIRED_COLUMNS =',
        );
        $preCopyContract = $this->extractArrayLiteral(
            $this->readFile(
                $repositoryRoot.'/api/scripts/ensure-operational-intake-schema.php',
            ),
            '$requiredColumns =',
        );

        $this->assertSame(
            $runtimeContract,
            $preCopyContract,
            'Runtime readiness and the cPanel pre-copy guard must validate the same columns.',
        );
    }

    private function extractArrayLiteral(string $contents, string $declaration): string
    {
        $matched = preg_match(
            '/'.preg_quote($declaration, '/').'\s*(\[.*?\n\s*\]);/s',
            $contents,
            $matches,
        );

        $this->assertSame(1, $matched, "Unable to locate {$declaration}");

        return preg_replace('/\s+/', '', $matches[1]) ?? '';
    }

    private function readFile(string $path): string
    {
        $contents = file_get_contents($path);
        $this->assertIsString($contents, "Unable to read {$path}");

        return $contents;
    }
}
