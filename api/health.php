<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
set_cors_headers();
json_response(['ok' => true, 'runtime' => 'php', 'timestamp' => gmdate('c')]);

