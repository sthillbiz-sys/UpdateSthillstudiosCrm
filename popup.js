<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BamLead</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">
        <span class="logo-icon">🎯</span>
        <span class="logo-text">BamLead</span>
      </div>
      <div class="status" id="status">
        <span class="status-dot"></span>
        <span class="status-text">Ready</span>
      </div>
    </header>

    <main class="main">
      <!-- Current Page Info -->
      <section class="section">
        <h3 class="section-title">Current Page</h3>
        <div class="page-info" id="pageInfo">
          <div class="page-url" id="pageUrl">Loading...</div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="section">
        <h3 class="section-title">Quick Actions</h3>
        <div class="actions">
          <button class="action-btn primary" id="extractBtn">
            <span class="btn-icon">🔍</span>
            Extract Contact Info
          </button>
          <button class="action-btn" id="analyzeBtn">
            <span class="btn-icon">📊</span>
            Analyze Website
          </button>
          <button class="action-btn" id="saveBtn">
            <span class="btn-icon">💾</span>
            Save as Lead
          </button>
        </div>
      </section>

      <!-- Extracted Data -->
      <section class="section" id="dataSection" style="display: none;">
        <h3 class="section-title">Extracted Data</h3>
        <div class="data-list" id="dataList">
          <!-- Populated by JS -->
        </div>
        <button class="action-btn success" id="sendToBamLead">
          <span class="btn-icon">🚀</span>
          Send to BamLead
        </button>
      </section>

      <!-- Saved Leads Count -->
      <section class="section">
        <div class="stats">
          <div class="stat">
            <span class="stat-value" id="leadsCount">0</span>
            <span class="stat-label">Leads Saved</span>
          </div>
          <div class="stat">
            <span class="stat-value" id="todayCount">0</span>
            <span class="stat-label">Today</span>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <a href="https://bamlead.com/dashboard" target="_blank" class="footer-link">
        Open Dashboard →
      </a>
    </footer>
  </div>

  <script src="popup.js"></script>
</body>
</html>
