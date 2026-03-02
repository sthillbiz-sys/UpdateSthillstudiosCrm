<?php
/**
 * Stripe API Endpoints
 * Handles checkout, portal, and subscription management
 */

require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/stripe.php';

// Handle CORS
setCorsHeaders();
handlePreflight();

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'create-checkout':
        handleCreateCheckout();
        break;
    case 'create-portal':
        handleCreatePortal();
        break;
    case 'subscription':
        handleGetSubscription();
        break;
    case 'cancel':
        handleCancelSubscription();
        break;
    case 'resume':
        handleResumeSubscription();
        break;
    case 'history':
        handleGetPaymentHistory();
        break;
    case 'config':
        handleGetConfig();
        break;
    default:
        sendError('Invalid action', 400);
}

/**
 * Create checkout session for subscription
 */
function handleCreateCheckout() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Method not allowed', 405);
    }
    
    $user = requireAuth();
    $input = getJsonInput();
    
    $plan = sanitizeInput($input['plan'] ?? '', 20);
    $billingPeriod = sanitizeInput($input['billing_period'] ?? 'monthly', 10);
    
    if (!in_array($plan, ['basic', 'pro', 'agency'])) {
        sendError('Invalid plan');
    }
    
    if (!in_array($billingPeriod, ['monthly', 'yearly'])) {
        sendError('Invalid billing period');
    }
    
    // Check if user is owner or has free account
    if ($user['is_owner'] || $user['subscription_plan'] === 'free_granted') {
        sendError('You already have unlimited access');
    }
    
    try {
        $session = createCheckoutSession($user, $plan, $billingPeriod);
        
        sendJson([
            'success' => true,
            'checkout_url' => $session->url,
            'session_id' => $session->id
        ]);
    } catch (Exception $e) {
        sendError($e->getMessage(), 500);
    }
}

/**
 * Create customer portal session
 */
function handleCreatePortal() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Method not allowed', 405);
    }
    
    $user = requireAuth();
    
    try {
        $session = createPortalSession($user);
        
        sendJson([
            'success' => true,
            'portal_url' => $session->url
        ]);
    } catch (Exception $e) {
        sendError($e->getMessage(), 500);
    }
}

/**
 * Get current subscription details
 */
function handleGetSubscription() {
    $user = requireAuth();
    
    $subscription = getUserSubscription($user['id']);
    
    sendJson([
        'success' => true,
        'subscription' => $subscription ? [
            'plan' => $subscription['plan_name'],
            'status' => $subscription['status'],
            'current_period_end' => $subscription['current_period_end'],
            'cancel_at_period_end' => (bool)$subscription['cancel_at_period_end'],
        ] : null,
        'is_owner' => (bool)$user['is_owner'],
        'is_free_account' => $user['subscription_plan'] === 'free_granted',
    ]);
}

/**
 * Cancel subscription
 */
function handleCancelSubscription() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Method not allowed', 405);
    }
    
    $user = requireAuth();
    $input = getJsonInput();
    $immediately = (bool)($input['immediately'] ?? false);
    
    try {
        cancelSubscription($user['id'], $immediately);
        
        sendJson([
            'success' => true,
            'message' => $immediately 
                ? 'Subscription canceled immediately'
                : 'Subscription will be canceled at the end of the billing period'
        ]);
    } catch (Exception $e) {
        sendError($e->getMessage(), 500);
    }
}

/**
 * Resume canceled subscription
 */
function handleResumeSubscription() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('Method not allowed', 405);
    }
    
    $user = requireAuth();
    
    try {
        resumeSubscription($user['id']);
        
        sendJson([
            'success' => true,
            'message' => 'Subscription resumed'
        ]);
    } catch (Exception $e) {
        sendError($e->getMessage(), 500);
    }
}

/**
 * Get payment history
 */
function handleGetPaymentHistory() {
    $user = requireAuth();
    
    $history = getPaymentHistory($user['id']);
    
    sendJson([
        'success' => true,
        'payments' => array_map(function($payment) {
            return [
                'id' => $payment['id'],
                'amount' => $payment['amount'] / 100, // Convert from cents
                'currency' => strtoupper($payment['currency']),
                'status' => $payment['status'],
                'description' => $payment['description'],
                'date' => $payment['created_at'],
            ];
        }, $history)
    ]);
}

/**
 * Get public Stripe config
 */
function handleGetConfig() {
    sendJson([
        'success' => true,
        'publishable_key' => STRIPE_PUBLISHABLE_KEY,
        'plans' => [
            'basic' => [
                'name' => 'Basic',
                'monthly_price' => 49,
                'yearly_price' => 470,
                'features' => [
                    '50 searches per day',
                    'Basic lead verification',
                    'CSV export',
                    'Email support',
                ],
            ],
            'pro' => [
                'name' => 'Pro',
                'monthly_price' => 99,
                'yearly_price' => 950,
                'features' => [
                    '200 searches per day',
                    'Advanced lead verification',
                    'CRM integrations',
                    'Priority support',
                    'Team collaboration (3 users)',
                ],
            ],
            'agency' => [
                'name' => 'Agency',
                'monthly_price' => 249,
                'yearly_price' => 2390,
                'features' => [
                    'Unlimited searches',
                    'Full lead verification',
                    'White-label exports',
                    'API access',
                    'Dedicated account manager',
                    'Unlimited team members',
                ],
            ],
        ],
    ]);
}
