<?php
/**
 * Stripe Webhook Handler
 * Receives events from Stripe and updates subscription status
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/database.php';
require_once __DIR__ . '/includes/stripe.php';

// Stripe webhooks don't use our normal CORS
header('Content-Type: application/json');

// Get the raw POST data
$payload = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

if (!$payload || !$sigHeader) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing payload or signature']);
    exit;
}

try {
    // Initialize Stripe
    if (!class_exists('\Stripe\Stripe')) {
        throw new Exception('Stripe SDK not installed');
    }
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);
    
    // Verify webhook signature
    $event = \Stripe\Webhook::constructEvent(
        $payload,
        $sigHeader,
        STRIPE_WEBHOOK_SECRET
    );
} catch (\UnexpectedValueException $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid payload']);
    exit;
} catch (\Stripe\Exception\SignatureVerificationException $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
}

// Log the event for debugging
error_log("Stripe webhook received: " . $event->type);

// Handle the event
switch ($event->type) {
    case 'checkout.session.completed':
        handleCheckoutCompleted($event->data->object);
        break;
        
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
        handleSubscriptionUpdated($event->data->object);
        break;
        
    case 'customer.subscription.deleted':
        handleSubscriptionDeleted($event->data->object);
        break;
        
    case 'invoice.paid':
        handleInvoicePaid($event->data->object);
        break;
        
    case 'invoice.payment_failed':
        handlePaymentFailed($event->data->object);
        break;
        
    default:
        // Unhandled event type
        error_log("Unhandled Stripe event: " . $event->type);
}

// Return success
http_response_code(200);
echo json_encode(['received' => true]);

/**
 * Handle checkout session completed
 */
function handleCheckoutCompleted($session) {
    $userId = $session->metadata->user_id ?? null;
    
    if (!$userId) {
        error_log("Checkout completed but no user_id in metadata");
        return;
    }
    
    // The subscription will be handled by customer.subscription.created event
    error_log("Checkout completed for user: $userId");
}

/**
 * Handle subscription created or updated
 */
function handleSubscriptionUpdated($subscription) {
    syncSubscriptionFromStripe($subscription);
    error_log("Subscription synced: " . $subscription->id);
}

/**
 * Handle subscription deleted/canceled
 */
function handleSubscriptionDeleted($subscription) {
    $db = getDB();
    
    $db->update(
        "UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE stripe_subscription_id = ?",
        [$subscription->id]
    );
    
    // Get user ID from subscription metadata
    $userId = $subscription->metadata->user_id ?? null;
    
    if ($userId) {
        $db->update(
            "UPDATE users SET subscription_status = 'cancelled' WHERE id = ?",
            [$userId]
        );
    }
    
    error_log("Subscription canceled: " . $subscription->id);
}

/**
 * Handle successful invoice payment
 */
function handleInvoicePaid($invoice) {
    // Get user from customer
    $db = getDB();
    $user = $db->fetchOne(
        "SELECT id FROM users WHERE stripe_customer_id = ?",
        [$invoice->customer]
    );
    
    if ($user) {
        recordPayment($user['id'], $invoice);
        error_log("Payment recorded for user: " . $user['id']);
    }
}

/**
 * Handle failed payment
 */
function handlePaymentFailed($invoice) {
    $db = getDB();
    
    // Update subscription status to past_due
    $db->update(
        "UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE stripe_customer_id = ?",
        [$invoice->customer]
    );
    
    // Could also send email notification to user here
    error_log("Payment failed for customer: " . $invoice->customer);
}
