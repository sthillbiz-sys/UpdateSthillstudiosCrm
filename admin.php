<?php
/**
 * Stripe Payment Integration for BamLead
 * Handles subscriptions, checkout, and webhooks
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/database.php';

// Check if Stripe SDK is available
// Install via Composer: composer require stripe/stripe-php
function initStripe() {
    if (!class_exists('\Stripe\Stripe')) {
        // If Stripe SDK not installed, provide instructions
        throw new Exception('Stripe SDK not installed. Run: composer require stripe/stripe-php');
    }
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);
}

/**
 * Get or create Stripe customer for user
 */
function getOrCreateStripeCustomer($user) {
    initStripe();
    $db = getDB();
    
    // Check if user already has a Stripe customer ID
    if (!empty($user['stripe_customer_id'])) {
        try {
            return \Stripe\Customer::retrieve($user['stripe_customer_id']);
        } catch (\Stripe\Exception\InvalidRequestException $e) {
            // Customer doesn't exist in Stripe, create new one
        }
    }
    
    // Create new customer
    $customer = \Stripe\Customer::create([
        'email' => $user['email'],
        'name' => $user['name'] ?? $user['email'],
        'metadata' => [
            'user_id' => $user['id'],
        ],
    ]);
    
    // Save customer ID to user
    $db->update(
        "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
        [$customer->id, $user['id']]
    );
    
    return $customer;
}

/**
 * Create a checkout session for subscription
 */
function createCheckoutSession($user, $planName, $billingPeriod = 'monthly') {
    initStripe();
    
    $prices = STRIPE_PRICES[$planName] ?? null;
    if (!$prices) {
        throw new Exception('Invalid plan');
    }
    
    $priceId = $prices[$billingPeriod] ?? $prices['monthly'];
    if (!$priceId) {
        throw new Exception('Price not configured for this plan');
    }
    
    $customer = getOrCreateStripeCustomer($user);
    
    $session = \Stripe\Checkout\Session::create([
        'customer' => $customer->id,
        'payment_method_types' => ['card'],
        'line_items' => [[
            'price' => $priceId,
            'quantity' => 1,
        ]],
        'mode' => 'subscription',
        'success_url' => FRONTEND_URL . '/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}',
        'cancel_url' => FRONTEND_URL . '/pricing?payment=canceled',
        'metadata' => [
            'user_id' => $user['id'],
            'plan' => $planName,
            'billing_period' => $billingPeriod,
        ],
        'subscription_data' => [
            'metadata' => [
                'user_id' => $user['id'],
                'plan' => $planName,
            ],
        ],
        'allow_promotion_codes' => true,
    ]);
    
    return $session;
}

/**
 * Create customer portal session
 */
function createPortalSession($user) {
    initStripe();
    
    if (empty($user['stripe_customer_id'])) {
        throw new Exception('No subscription found');
    }
    
    $session = \Stripe\BillingPortal\Session::create([
        'customer' => $user['stripe_customer_id'],
        'return_url' => FRONTEND_URL . '/dashboard',
    ]);
    
    return $session;
}

/**
 * Get user's subscription details
 */
function getUserSubscription($userId) {
    $db = getDB();
    
    return $db->fetchOne(
        "SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [$userId]
    );
}

/**
 * Sync subscription status from Stripe
 */
function syncSubscriptionFromStripe($stripeSubscription, $userId = null) {
    $db = getDB();
    
    // Get user ID from metadata if not provided
    if (!$userId) {
        $userId = $stripeSubscription->metadata->user_id ?? null;
    }
    
    if (!$userId) {
        error_log("Cannot sync subscription: no user_id found");
        return false;
    }
    
    $planName = $stripeSubscription->metadata->plan ?? 'unknown';
    $status = $stripeSubscription->status;
    
    // Map Stripe status to our status
    $statusMap = [
        'active' => 'active',
        'past_due' => 'past_due',
        'canceled' => 'canceled',
        'incomplete' => 'incomplete',
        'incomplete_expired' => 'canceled',
        'trialing' => 'trialing',
        'unpaid' => 'past_due',
    ];
    
    $mappedStatus = $statusMap[$status] ?? 'incomplete';
    
    // Check if subscription exists
    $existing = $db->fetchOne(
        "SELECT id FROM subscriptions WHERE stripe_subscription_id = ?",
        [$stripeSubscription->id]
    );
    
    if ($existing) {
        // Update existing
        $db->update(
            "UPDATE subscriptions SET 
                status = ?,
                current_period_start = FROM_UNIXTIME(?),
                current_period_end = FROM_UNIXTIME(?),
                cancel_at_period_end = ?,
                updated_at = NOW()
             WHERE stripe_subscription_id = ?",
            [
                $mappedStatus,
                $stripeSubscription->current_period_start,
                $stripeSubscription->current_period_end,
                $stripeSubscription->cancel_at_period_end ? 1 : 0,
                $stripeSubscription->id
            ]
        );
    } else {
        // Insert new
        $db->insert(
            "INSERT INTO subscriptions 
                (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, plan_name, status, current_period_start, current_period_end, cancel_at_period_end)
             VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?)",
            [
                $userId,
                $stripeSubscription->customer,
                $stripeSubscription->id,
                $stripeSubscription->items->data[0]->price->id ?? '',
                $planName,
                $mappedStatus,
                $stripeSubscription->current_period_start,
                $stripeSubscription->current_period_end,
                $stripeSubscription->cancel_at_period_end ? 1 : 0
            ]
        );
    }
    
    // Update user subscription status
    $userStatus = ($mappedStatus === 'active' || $mappedStatus === 'trialing') ? 'active' : 'expired';
    $db->update(
        "UPDATE users SET subscription_status = ?, subscription_plan = ?, subscription_ends_at = FROM_UNIXTIME(?) WHERE id = ?",
        [$userStatus, $planName, $stripeSubscription->current_period_end, $userId]
    );
    
    return true;
}

/**
 * Record payment in history
 */
function recordPayment($userId, $invoice) {
    $db = getDB();
    
    $db->insert(
        "INSERT INTO payment_history (user_id, stripe_payment_intent_id, stripe_invoice_id, amount, currency, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            $userId,
            $invoice->payment_intent ?? '',
            $invoice->id,
            $invoice->amount_paid,
            $invoice->currency,
            $invoice->status,
            $invoice->lines->data[0]->description ?? 'Subscription payment'
        ]
    );
}

/**
 * Get user's payment history
 */
function getPaymentHistory($userId, $limit = 10) {
    $db = getDB();
    
    return $db->fetchAll(
        "SELECT * FROM payment_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        [$userId, $limit]
    );
}

/**
 * Cancel subscription
 */
function cancelSubscription($userId, $immediately = false) {
    initStripe();
    $db = getDB();
    
    $subscription = getUserSubscription($userId);
    
    if (!$subscription || !$subscription['stripe_subscription_id']) {
        throw new Exception('No active subscription found');
    }
    
    $stripeSubscription = \Stripe\Subscription::retrieve($subscription['stripe_subscription_id']);
    
    if ($immediately) {
        $stripeSubscription->cancel();
    } else {
        \Stripe\Subscription::update($subscription['stripe_subscription_id'], [
            'cancel_at_period_end' => true,
        ]);
    }
    
    // Update local record
    $db->update(
        "UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = NOW() WHERE id = ?",
        [$subscription['id']]
    );
    
    return true;
}

/**
 * Resume a canceled subscription
 */
function resumeSubscription($userId) {
    initStripe();
    $db = getDB();
    
    $subscription = getUserSubscription($userId);
    
    if (!$subscription || !$subscription['stripe_subscription_id']) {
        throw new Exception('No subscription found');
    }
    
    \Stripe\Subscription::update($subscription['stripe_subscription_id'], [
        'cancel_at_period_end' => false,
    ]);
    
    $db->update(
        "UPDATE subscriptions SET cancel_at_period_end = 0, updated_at = NOW() WHERE id = ?",
        [$subscription['id']]
    );
    
    return true;
}
