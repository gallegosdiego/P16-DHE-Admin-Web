<?php

namespace App\Http\Controllers\Api;

use App\Domain\Shipment\Models\CustodyReview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustodyReviewController
{
    public function index(Request $r)
    {
        $q = CustodyReview::with('shipment')->latest('occurred_at');
        if ($r->filled('status')) {
            $q->where('status', $r->string('status'));
        }

        return response()->json(['data' => $q->get()]);
    }

    public function acknowledge(Request $r, CustodyReview $review)
    {
        $review = DB::transaction(function () use ($review, $r) {
            $review = CustodyReview::whereKey($review->id)->lockForUpdate()->firstOrFail();
            if ($review->status === 'pending') {
                $review->update(['status' => 'acknowledged', 'acknowledged_by_user_id' => $r->user()->id, 'acknowledged_at' => now()]);
            }

            return $review->fresh();
        });

        return response()->json(['data' => $review]);
    }
}
