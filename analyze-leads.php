# Enable CORS and routing for API
<IfModule mod_headers.c>
    Header always set Access-Control-Allow-Origin "*"
    Header always set Access-Control-Allow-Methods "POST, GET, OPTIONS"
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization"
</IfModule>

# Handle OPTIONS preflight requests
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]

# Protect config file
<Files "config.php">
    Order allow,deny
    Deny from all
</Files>

# Protect includes directory
<IfModule mod_rewrite.c>
    RewriteRule ^includes/ - [F,L]
</IfModule>

# Protect cache directory  
<IfModule mod_rewrite.c>
    RewriteRule ^cache/ - [F,L]
</IfModule>

# Enable compression for JSON responses
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE application/json
</IfModule>

# Error handling
ErrorDocument 404 /api/error.php
ErrorDocument 500 /api/error.php
