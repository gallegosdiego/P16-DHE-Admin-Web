<?php

namespace App\Providers;

use App\Domain\Financial\Models\CodSettlement;
use App\Domain\Financial\Models\DriverPayout;
use App\Domain\Financial\Models\Employee;
use App\Domain\Financial\Models\FixedExpense;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Route model bindings explícitos (nombres no convencionales)
        Route::model('expense', FixedExpense::class);
        Route::model('employee', Employee::class);
        Route::model('settlement', CodSettlement::class);
        Route::model('payout', DriverPayout::class);

        // Superadmin tiene acceso total a todo
        Gate::before(function ($user, $ability) {
            return $user->hasRole('superadmin') ? true : null;
        });

        // Rate limiters para producción
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('auth', function (Request $request) {
            // Desactivado temporalmente para pruebas locales
            return Limit::none();
        });
    }
}
