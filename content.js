/* BamLead Chrome Extension - Content Styles */

.bamlead-highlight {
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.3) 0%, rgba(13, 148, 136, 0.3) 100%) !important;
  border-radius: 2px;
  padding: 1px 3px;
  transition: all 0.3s ease;
}

.bamlead-highlight:hover {
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.5) 0%, rgba(13, 148, 136, 0.5) 100%) !important;
  cursor: pointer;
}

/* Floating action button */
.bamlead-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
  box-shadow: 0 4px 12px rgba(20, 184, 166, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 999999;
  transition: all 0.3s ease;
  border: none;
}

.bamlead-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(20, 184, 166, 0.5);
}

.bamlead-fab svg {
  width: 24px;
  height: 24px;
  fill: white;
}

/* Tooltip */
.bamlead-tooltip {
  position: fixed;
  background: #0f172a;
  color: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  z-index: 999999;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.bamlead-tooltip.visible {
  opacity: 1;
}

/* Mini notification */
.bamlead-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #22c55e;
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  z-index: 999999;
  animation: bamleadSlideIn 0.3s ease;
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

@keyframes bamleadSlideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
