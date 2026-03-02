<?php
/**
 * Error Handler for BamLead API
 */

require_once __DIR__ . '/includes/functions.php';

setCorsHeaders();
handlePreflight();

$statusCode = http_response_code();

$errors = [
    400 => 'Bad Request',
    401 => 'Unauthorized',
    403 => 'Forbidden',
    404 => 'Not Found',
    405 => 'Method Not Allowed',
    429 => 'Too Many Requests',
    500 => 'Internal Server Error',
    502 => 'Bad Gateway',
    503 => 'Service Unavailable'
];

$message = $errors[$statusCode] ?? 'Unknown Error';

sendJson([
    'success' => false,
    'error' => $message,
    'code' => $statusCode
], $statusCode);
