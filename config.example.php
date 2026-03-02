<?php
/**
 * Call Logs API Endpoint
 * Handles saving and retrieving voice call logs
 */

require_once __DIR__ . '/includes/database.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Authenticate user
$user = authenticateRequest();
if (!$user) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit();
}

$action = $_GET['action'] ?? '';
$db = getDB();

try {
    switch ($action) {
        case 'list':
            handleListLogs($db, $user);
            break;
            
        case 'save':
            handleSaveLog($db, $user);
            break;
            
        case 'update':
            handleUpdateLog($db, $user);
            break;
            
        case 'delete':
            handleDeleteLog($db, $user);
            break;
            
        case 'stats':
            handleCallStats($db, $user);
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid action']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * List call logs for the user
 */
function handleListLogs($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }

    $limit = min(100, max(1, intval($_GET['limit'] ?? 50)));
    $offset = max(0, intval($_GET['offset'] ?? 0));
    $outcome = $_GET['outcome'] ?? null;
    
    $sql = "SELECT * FROM call_logs WHERE user_id = ?";
    $params = [$user['id']];
    
    if ($outcome && in_array($outcome, ['completed', 'no_answer', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other'])) {
        $sql .= " AND outcome = ?";
        $params[] = $outcome;
    }
    
    $sql .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Parse JSON transcript
    foreach ($logs as &$log) {
        if ($log['transcript']) {
            $log['transcript'] = json_decode($log['transcript'], true);
        }
    }
    
    // Get total count
    $countSql = "SELECT COUNT(*) FROM call_logs WHERE user_id = ?";
    $countParams = [$user['id']];
    if ($outcome) {
        $countSql .= " AND outcome = ?";
        $countParams[] = $outcome;
    }
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($countParams);
    $total = $countStmt->fetchColumn();
    
    echo json_encode([
        'success' => true,
        'logs' => $logs,
        'total' => intval($total),
        'limit' => $limit,
        'offset' => $offset
    ]);
}

/**
 * Save a new call log
 */
function handleSaveLog($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON input']);
        return;
    }
    
    $agentId = $input['agent_id'] ?? '';
    $duration = intval($input['duration_seconds'] ?? 0);
    $outcome = $input['outcome'] ?? 'completed';
    $notes = $input['notes'] ?? null;
    $transcript = $input['transcript'] ?? null;
    $leadId = $input['lead_id'] ?? null;
    $leadName = $input['lead_name'] ?? null;
    $leadPhone = $input['lead_phone'] ?? null;
    
    // Validate outcome
    $validOutcomes = ['completed', 'no_answer', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other'];
    if (!in_array($outcome, $validOutcomes)) {
        $outcome = 'completed';
    }
    
    $stmt = $db->prepare("
        INSERT INTO call_logs (user_id, lead_id, lead_name, lead_phone, agent_id, duration_seconds, outcome, notes, transcript)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    
    $stmt->execute([
        $user['id'],
        $leadId,
        $leadName,
        $leadPhone,
        $agentId,
        $duration,
        $outcome,
        $notes,
        $transcript ? json_encode($transcript) : null
    ]);
    
    $logId = $db->lastInsertId();
    
    echo json_encode([
        'success' => true,
        'log_id' => intval($logId),
        'message' => 'Call log saved successfully'
    ]);
}

/**
 * Update a call log (outcome, notes)
 */
function handleUpdateLog($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $logId = intval($input['id'] ?? 0);
    
    if (!$logId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Log ID required']);
        return;
    }
    
    // Verify ownership
    $stmt = $db->prepare("SELECT id FROM call_logs WHERE id = ? AND user_id = ?");
    $stmt->execute([$logId, $user['id']]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Call log not found']);
        return;
    }
    
    $updates = [];
    $params = [];
    
    if (isset($input['outcome'])) {
        $validOutcomes = ['completed', 'no_answer', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other'];
        if (in_array($input['outcome'], $validOutcomes)) {
            $updates[] = "outcome = ?";
            $params[] = $input['outcome'];
        }
    }
    
    if (isset($input['notes'])) {
        $updates[] = "notes = ?";
        $params[] = $input['notes'];
    }
    
    if (empty($updates)) {
        echo json_encode(['success' => true, 'message' => 'No updates provided']);
        return;
    }
    
    $params[] = $logId;
    $stmt = $db->prepare("UPDATE call_logs SET " . implode(", ", $updates) . " WHERE id = ?");
    $stmt->execute($params);
    
    echo json_encode(['success' => true, 'message' => 'Call log updated']);
}

/**
 * Delete a call log
 */
function handleDeleteLog($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $logId = intval($input['id'] ?? $_GET['id'] ?? 0);
    
    if (!$logId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Log ID required']);
        return;
    }
    
    $stmt = $db->prepare("DELETE FROM call_logs WHERE id = ? AND user_id = ?");
    $stmt->execute([$logId, $user['id']]);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true, 'message' => 'Call log deleted']);
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Call log not found']);
    }
}

/**
 * Get call statistics
 */
function handleCallStats($db, $user) {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        return;
    }
    
    // Total calls
    $stmt = $db->prepare("SELECT COUNT(*) FROM call_logs WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    $totalCalls = $stmt->fetchColumn();
    
    // Total duration
    $stmt = $db->prepare("SELECT SUM(duration_seconds) FROM call_logs WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    $totalDuration = $stmt->fetchColumn() ?? 0;
    
    // Outcomes breakdown
    $stmt = $db->prepare("
        SELECT outcome, COUNT(*) as count 
        FROM call_logs 
        WHERE user_id = ? 
        GROUP BY outcome
    ");
    $stmt->execute([$user['id']]);
    $outcomes = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    // Calls this week
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM call_logs 
        WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ");
    $stmt->execute([$user['id']]);
    $callsThisWeek = $stmt->fetchColumn();
    
    // Average call duration
    $avgDuration = $totalCalls > 0 ? round($totalDuration / $totalCalls) : 0;
    
    echo json_encode([
        'success' => true,
        'stats' => [
            'total_calls' => intval($totalCalls),
            'total_duration_seconds' => intval($totalDuration),
            'average_duration_seconds' => $avgDuration,
            'calls_this_week' => intval($callsThisWeek),
            'outcomes' => $outcomes,
            'interested_rate' => $totalCalls > 0 ? round((($outcomes['interested'] ?? 0) / $totalCalls) * 100, 1) : 0
        ]
    ]);
}
