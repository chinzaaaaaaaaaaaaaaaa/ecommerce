/* ═══════════════════════════════════════════════════════════════
   DIGITALSTORE — TUTORIAL MODALS (3 sections)
   Catalogue · Panier · Paiement
   Inject this file at the bottom of your <body>, after your main script.
   Then add: <link rel="stylesheet" href="tutorial-modals.css">
   And call openTutorialModal('catalog') / ('cart') / ('payment')
   from your nav buttons or anywhere you want.
═══════════════════════════════════════════════════════════════ */

(function () {
  /* ── Inject CSS ── */
  const style = document.createElement("style");
  style.textContent = `
/* ═══════════════════════
   ROOT VARS (inherits from app)
═══════════════════════ */
.tm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(8, 12, 25, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: 'DM Sans', sans-serif;
}
.tm-overlay.open {
  display: flex;
  animation: tmFadeIn 0.3s ease forwards;
}
@keyframes tmFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Modal shell ── */
.tm-modal {
  background: var(--surface, #fff);
  border-radius: 28px;
  width: 780px;
  max-width: 100%;
  max-height: 92vh;
  overflow: hidden;
  box-shadow: 0 40px 120px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  animation: tmSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
}
@keyframes tmSlideUp {
  from { transform: translateY(40px) scale(0.96); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

/* ── Header ── */
.tm-header {
  padding: 24px 28px 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.tm-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: linear-gradient(135deg, var(--teal,#497b89), #6366f1);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 5px 13px;
  border-radius: 99px;
  margin-bottom: 10px;
}
.tm-title {
  font-family: 'Syne', sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: var(--text, #111);
  line-height: 1.2;
  flex: 1;
}
.tm-close {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1.5px solid var(--border, #e2e2df);
  background: var(--surface2, #eeeeeb);
  color: var(--muted, #7a7a76);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}
.tm-close:hover { background: var(--border,#e2e2df); color: var(--text,#111); }

/* ── Step pills ── */
.tm-steps-nav {
  display: flex;
  gap: 6px;
  padding: 16px 28px 0;
  flex-wrap: wrap;
}
.tm-step-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  border: 1.5px solid var(--border,#e2e2df);
  background: transparent;
  color: var(--muted,#7a7a76);
  font-family: 'DM Sans', sans-serif;
  transition: all 0.22s;
  white-space: nowrap;
}
.tm-step-pill.active {
  background: var(--teal,#497b89);
  border-color: var(--teal,#497b89);
  color: #fff;
}
.tm-step-pill:hover:not(.active) {
  border-color: var(--teal,#497b89);
  color: var(--teal,#497b89);
}
.tm-step-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.tm-step-pill:not(.active) .tm-step-num {
  background: var(--border,#e2e2df);
  color: var(--text,#111);
}

/* ── Body split ── */
.tm-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 0;
  flex: 1;
  overflow: hidden;
  padding: 20px 28px 24px;
  gap: 20px;
}
@media(max-width: 680px) {
  .tm-body { grid-template-columns: 1fr; }
  .tm-anim-panel { display: none; }
}

/* ── Description panel ── */
.tm-desc-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.tm-step-content {
  display: none;
  animation: tmContentIn 0.35s ease forwards;
}
.tm-step-content.active { display: flex; flex-direction: column; gap: 12px; }
@keyframes tmContentIn {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: none; }
}
.tm-step-emoji {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 4px;
}
.tm-step-title {
  font-family: 'Syne', sans-serif;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text,#111);
}
.tm-step-desc {
  color: var(--muted,#7a7a76);
  font-size: 14px;
  line-height: 1.72;
}
.tm-tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--teal-light, rgba(73,123,137,.1));
  border: 1px solid rgba(73,123,137,0.2);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text,#111);
  line-height: 1.55;
}
.tm-tip-icon {
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ── Progress bar ── */
.tm-progress {
  margin-top: 16px;
}
.tm-progress-track {
  height: 4px;
  background: var(--border,#e2e2df);
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 8px;
}
.tm-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--teal,#497b89), #6366f1);
  border-radius: 99px;
  transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
}
.tm-progress-text {
  font-size: 12px;
  color: var(--muted,#7a7a76);
  font-weight: 600;
}

/* ── Navigation buttons ── */
.tm-nav {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.tm-btn-prev {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1.5px solid var(--border,#e2e2df);
  background: var(--surface2,#eeeeeb);
  color: var(--text,#111);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tm-btn-prev:hover:not(:disabled) { background: var(--border,#e2e2df); }
.tm-btn-prev:disabled { opacity: 0.3; cursor: default; }
.tm-btn-next {
  flex: 1;
  padding: 0 20px;
  height: 42px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, var(--teal,#497b89), #6366f1);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all 0.22s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 4px 16px rgba(73,123,137,0.3);
}
.tm-btn-next:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(73,123,137,0.4); }

/* ── Animation panel ── */
.tm-anim-panel {
  background: var(--surface2,#eeeeeb);
  border-radius: 20px;
  border: 1px solid var(--border,#e2e2df);
  position: relative;
  overflow: hidden;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── SCENE containers ── */
.tm-scene {
  display: none;
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
}
.tm-scene.active { display: flex; animation: tmSceneIn 0.4s ease forwards; }
@keyframes tmSceneIn {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: none; }
}

/* ════════════════════════════════
   HAND CURSOR (reusable)
════════════════════════════════ */
.tm-hand {
  position: absolute;
  font-size: 36px;
  z-index: 10;
  pointer-events: none;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));
  transform-origin: bottom left;
}

/* ════════════════════════════════
   SCENE: CATALOG — Filter + Card
════════════════════════════════ */
.tm-catalog-scene {
  flex-direction: column;
  padding: 20px;
  gap: 10px;
}
.tm-cat-sidebar {
  position: absolute;
  left: 16px;
  top: 24px;
  width: 72px;
  background: var(--surface,#fff);
  border: 1px solid var(--border,#e2e2df);
  border-radius: 10px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.tm-cat-pill {
  height: 10px;
  border-radius: 99px;
  background: var(--border,#e2e2df);
  transition: background 0.3s;
}
.tm-cat-pill.highlighted {
  background: var(--teal,#497b89);
  box-shadow: 0 0 0 3px rgba(73,123,137,0.2);
  animation: tmPillPulse 1.2s ease infinite;
}
@keyframes tmPillPulse {
  0%,100% { box-shadow: 0 0 0 3px rgba(73,123,137,0.2); }
  50%      { box-shadow: 0 0 0 6px rgba(73,123,137,0.08); }
}
.tm-mini-cards {
  position: absolute;
  right: 12px;
  top: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 188px;
}
.tm-mini-card {
  background: var(--surface,#fff);
  border: 1px solid var(--border,#e2e2df);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
  flex: 1;
}
.tm-mini-card.hovered {
  border-color: var(--teal,#497b89);
  box-shadow: 0 4px 16px rgba(73,123,137,0.18);
  transform: translateY(-2px);
}
.tm-card-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #e0f2fe, #bfdbfe);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.tm-card-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tm-card-line {
  height: 7px;
  border-radius: 99px;
  background: var(--border,#e2e2df);
}
.tm-card-line.short { width: 60%; }
.tm-card-line.teal  { background: var(--teal,#497b89); width: 80%; }
.tm-add-badge {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--teal,#497b89);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s;
}
.tm-mini-card.hovered .tm-add-badge { transform: scale(1.15); }

/* Search bar mock */
.tm-search-mock {
  position: absolute;
  top: 8px;
  left: 96px;
  right: 12px;
  height: 30px;
  background: var(--surface,#fff);
  border: 1.5px solid var(--border,#e2e2df);
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
  font-size: 11px;
  color: var(--muted,#7a7a76);
  transition: border-color 0.3s;
}
.tm-search-mock.focused { border-color: var(--teal,#497b89); }
.tm-search-typing {
  font-size: 11px;
  color: var(--text,#111);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  border-right: 1.5px solid var(--teal,#497b89);
  animation: tmBlink 0.8s step-end infinite;
}
@keyframes tmBlink { 50% { border-color: transparent; } }

/* ════════════════════════════════
   SCENE: CART
════════════════════════════════ */
.tm-cart-scene {
  padding: 16px;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.tm-cart-item-mock {
  background: var(--surface,#fff);
  border: 1px solid var(--border,#e2e2df);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s;
  width: 100%;
}
.tm-cart-item-mock.removing {
  transform: translateX(40px);
  opacity: 0;
}
.tm-ci-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.tm-ci-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.tm-ci-line { height: 8px; border-radius: 99px; background: var(--border,#e2e2df); }
.tm-ci-line.short { width: 55%; }
.tm-qty-mock {
  display: flex;
  align-items: center;
  border: 1px solid var(--border,#e2e2df);
  border-radius: 8px;
  overflow: hidden;
}
.tm-qty-b {
  width: 26px;
  height: 26px;
  background: var(--surface2,#eeeeeb);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text,#111);
}
.tm-qty-v {
  width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text,#111);
  transition: all 0.25s;
}
.tm-ci-price {
  font-family: 'Syne', sans-serif;
  font-size: 13px;
  font-weight: 800;
  color: var(--teal,#497b89);
  white-space: nowrap;
}
/* Summary box */
.tm-summary-mock {
  background: var(--surface,#fff);
  border: 1px solid var(--border,#e2e2df);
  border-radius: 12px;
  padding: 10px 14px;
  width: 100%;
}
.tm-sum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 11px;
}
.tm-sum-lbl { color: var(--muted,#7a7a76); }
.tm-sum-val { font-weight: 700; color: var(--text,#111); }
.tm-sum-total {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1.5px solid var(--text,#111);
  font-size: 13px;
  font-weight: 800;
}
.tm-promo-row {
  display: flex;
  gap: 6px;
  margin: 6px 0;
}
.tm-promo-input {
  flex: 1;
  height: 26px;
  border: 1.5px solid var(--border,#e2e2df);
  border-radius: 7px;
  background: var(--surface2,#eeeeeb);
  font-size: 10px;
  padding: 0 8px;
  color: var(--muted,#7a7a76);
  font-family: 'DM Sans', sans-serif;
  display: flex;
  align-items: center;
  transition: border-color 0.3s;
}
.tm-promo-input.active { border-color: var(--teal,#497b89); color: var(--teal,#497b89); font-weight: 700; }
.tm-promo-btn {
  height: 26px;
  padding: 0 8px;
  border-radius: 7px;
  background: var(--teal,#497b89);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.tm-checkout-btn {
  width: 100%;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--teal,#497b89), #6366f1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
  box-shadow: 0 4px 12px rgba(73,123,137,0.25);
  transition: transform 0.2s;
}
.tm-checkout-btn.pulse { animation: tmCheckoutPulse 1s ease infinite; }
@keyframes tmCheckoutPulse {
  0%,100% { box-shadow: 0 4px 12px rgba(73,123,137,0.25); }
  50%      { box-shadow: 0 6px 24px rgba(73,123,137,0.5); }
}

/* ════════════════════════════════
   SCENE: PAYMENT
════════════════════════════════ */
.tm-pay-scene {
  padding: 16px;
  flex-direction: column;
  gap: 8px;
}
.tm-pay-methods-mock {
  display: flex;
  gap: 6px;
  width: 100%;
}
.tm-pay-m {
  flex: 1;
  height: 44px;
  border-radius: 10px;
  border: 2px solid var(--border,#e2e2df);
  background: var(--surface,#fff);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 18px;
  transition: all 0.3s;
}
.tm-pay-m.selected {
  border-color: var(--teal,#497b89);
  background: rgba(73,123,137,0.08);
  box-shadow: 0 0 0 3px rgba(73,123,137,0.15);
}
.tm-pay-m-lbl { font-size: 9px; font-weight: 700; color: var(--muted,#7a7a76); }
.tm-pay-m.selected .tm-pay-m-lbl { color: var(--teal,#497b89); }
/* Card visual */
.tm-card-visual {
  width: 100%;
  height: 80px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1a2e35, #497b89);
  position: relative;
  overflow: hidden;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.4s;
}
.tm-card-visual::before {
  content: '';
  position: absolute;
  right: -20px;
  top: -20px;
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, rgba(255,255,255,0.1), transparent 70%);
}
.tm-card-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.9);
}
.tm-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.tm-card-name { font-size: 9px; color: rgba(255,255,255,0.8); font-weight: 600; }
.tm-card-exp  { font-size: 9px; color: rgba(255,255,255,0.8); }
/* Form fields mock */
.tm-form-mock { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.tm-field-mock {
  height: 28px;
  border: 1.5px solid var(--border,#e2e2df);
  border-radius: 8px;
  background: var(--surface2,#eeeeeb);
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 10px;
  color: var(--muted,#7a7a76);
  transition: border-color 0.3s;
}
.tm-field-mock.focused { border-color: var(--teal,#497b89); background: var(--surface,#fff); }
.tm-field-typing { color: var(--text,#111); font-weight: 600; }
.tm-fields-row { display: flex; gap: 6px; }
.tm-fields-row .tm-field-mock { flex: 1; }
/* Secure badge */
.tm-secure-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(21,128,61,0.1);
  border: 1px solid rgba(21,128,61,0.2);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  color: #15803d;
  width: 100%;
}
/* Submit btn */
.tm-submit-mock {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--teal,#497b89), #6366f1);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-shadow: 0 4px 14px rgba(73,123,137,0.3);
  transition: all 0.3s;
}
.tm-submit-mock.success {
  background: linear-gradient(135deg, #15803d, #16a34a);
  box-shadow: 0 4px 14px rgba(21,128,61,0.4);
}

/* ════════════════════════════════
   HAND ANIMATIONS per scene
════════════════════════════════ */

/* Catalog scene */
.tm-hand-catalog-filter {
  bottom: 100px;
  left: 24px;
  animation: handFilterClick 3.5s ease-in-out infinite;
}
@keyframes handFilterClick {
  0%,100% { transform: translate(0,0) rotate(-10deg); opacity: 0; }
  10%      { opacity: 1; }
  20%      { transform: translate(0,0) rotate(-10deg); }
  35%      { transform: translate(0,0) rotate(-20deg) scale(0.9); }
  50%      { transform: translate(0,0) rotate(-10deg); }
  60%      { transform: translate(0,-14px) rotate(-10deg); }
  80%      { transform: translate(0,-14px) rotate(-10deg); opacity: 1; }
  95%      { opacity: 0; }
}

.tm-hand-catalog-hover {
  right: 80px;
  bottom: 110px;
  animation: handCardHover 4s ease-in-out infinite;
}
@keyframes handCardHover {
  0%,100% { transform: translate(0,0) rotate(10deg); opacity: 0; }
  10%      { opacity: 1; }
  25%      { transform: translate(0,-6px) rotate(5deg); }
  45%      { transform: translate(0,-6px) rotate(5deg); }
  60%      { transform: translate(30px,-6px) rotate(5deg); }
  75%      { transform: translate(30px,-6px) rotate(5deg); }
  90%      { opacity: 0; }
}

.tm-hand-catalog-add {
  right: 30px;
  bottom: 60px;
  animation: handAddClick 3.8s ease-in-out infinite 1.5s;
}
@keyframes handAddClick {
  0%,100% { transform: translate(0,0) rotate(5deg); opacity: 0; }
  10%      { opacity: 1; }
  30%      { transform: translate(0,0) rotate(5deg); }
  45%      { transform: translate(0,6px) rotate(10deg) scale(0.88); }
  55%      { transform: translate(0,0) rotate(5deg); }
  80%      { opacity: 1; }
  95%      { opacity: 0; }
}

/* Cart scene */
.tm-hand-cart-qty {
  bottom: 168px;
  right: 52px;
  animation: handQtyClick 3.5s ease-in-out infinite;
}
@keyframes handQtyClick {
  0%,100% { transform: translate(0,0) rotate(5deg); opacity: 0; }
  10%      { opacity: 1; }
  25%      { transform: translate(0,0) rotate(5deg); }
  40%      { transform: translate(0,6px) rotate(10deg) scale(0.88); }
  50%      { transform: translate(0,0) rotate(5deg); }
  75%      { transform: translate(0,0) rotate(5deg); opacity: 1; }
  90%      { opacity: 0; }
}

.tm-hand-cart-promo {
  left: 60px;
  bottom: 106px;
  animation: handPromoType 4s ease-in-out infinite 1.8s;
}
@keyframes handPromoType {
  0%,100% { transform: translate(0,0) rotate(-8deg); opacity: 0; }
  10%      { opacity: 1; }
  25%      { transform: translate(0,-6px) rotate(-15deg) scale(0.9); }
  40%      { transform: translate(0,0) rotate(-8deg); }
  80%      { opacity: 1; }
  95%      { opacity: 0; }
}

.tm-hand-cart-checkout {
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) rotate(-5deg);
  animation: handCheckout 4s ease-in-out infinite 3.5s;
}
@keyframes handCheckout {
  0%,100% { transform: translateX(-50%) rotate(-5deg); opacity: 0; }
  10%      { opacity: 1; }
  30%      { transform: translateX(-50%) rotate(-5deg); }
  45%      { transform: translateX(-50%) translateY(6px) rotate(-10deg) scale(0.88); }
  55%      { transform: translateX(-50%) rotate(-5deg); }
  80%      { opacity: 1; }
  95%      { opacity: 0; }
}

/* Payment scene */
.tm-hand-pay-method {
  bottom: 200px;
  left: 40px;
  animation: handSelectMethod 3.5s ease-in-out infinite;
}
@keyframes handSelectMethod {
  0%,100% { transform: translate(0,0) rotate(-5deg); opacity: 0; }
  10%      { opacity: 1; }
  25%      { transform: translate(10px,0) rotate(-5deg); }
  40%      { transform: translate(10px,6px) rotate(-12deg) scale(0.9); }
  55%      { transform: translate(10px,0) rotate(-5deg); }
  80%      { opacity: 1; }
  95%      { opacity: 0; }
}

.tm-hand-pay-field {
  top: 130px;
  right: 40px;
  animation: handFillField 3.8s ease-in-out infinite 2s;
}
@keyframes handFillField {
  0%,100% { transform: translate(0,0) rotate(8deg); opacity: 0; }
  10%      { opacity: 1; }
  25%      { transform: translate(0,-4px) rotate(8deg); }
  40%      { transform: translate(0,-4px) rotate(14deg) scale(0.9); }
  55%      { transform: translate(0,10px) rotate(8deg); }
  70%      { transform: translate(0,28px) rotate(8deg); }
  85%      { opacity: 1; }
  95%      { opacity: 0; }
}

.tm-hand-pay-submit {
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  animation: handSubmitPay 4s ease-in-out infinite 4s;
}
@keyframes handSubmitPay {
  0%,100% { transform: translateX(-50%) rotate(0deg); opacity: 0; }
  10%      { opacity: 1; }
  30%      { transform: translateX(-50%) rotate(0deg); }
  45%      { transform: translateX(-50%) translateY(6px) rotate(-6deg) scale(0.88); }
  58%      { transform: translateX(-50%) rotate(0deg); }
  82%      { opacity: 1; }
  96%      { opacity: 0; }
}

/* ── Dark mode adjustments ── */
[data-theme="dark"] .tm-modal { background: #1a1d27; }
[data-theme="dark"] .tm-anim-panel { background: #222533; border-color: #2e3244; }
[data-theme="dark"] .tm-mini-card,
[data-theme="dark"] .tm-cart-item-mock,
[data-theme="dark"] .tm-summary-mock,
[data-theme="dark"] .tm-field-mock { background: #1a1d27 !important; border-color: #2e3244 !important; }
[data-theme="dark"] .tm-field-mock.focused { background: #222533 !important; }
[data-theme="dark"] .tm-search-mock { background: #1a1d27; border-color: #2e3244; }
[data-theme="dark"] .tm-cat-sidebar { background: #1a1d27; border-color: #2e3244; }
[data-theme="dark"] .tm-card-line,
[data-theme="dark"] .tm-ci-line,
[data-theme="dark"] .tm-cat-pill { background: #2e3244; }
[data-theme="dark"] .tm-qty-b { background: #2e3244; }
[data-theme="dark"] .tm-close,
[data-theme="dark"] .tm-btn-prev { background: #2e3244; border-color: #2e3244; color: #e8e9f0; }
[data-theme="dark"] .tm-step-pill { border-color: #2e3244; color: #8b8fa8; }
[data-theme="dark"] .tm-pay-m { background: #1a1d27; border-color: #2e3244; }
[data-theme="dark"] .tm-promo-input { background: #1a1d27; }
[data-theme="dark"] .tm-qty-v,
[data-theme="dark"] .tm-sum-val,
[data-theme="dark"] .tm-sum-total,
[data-theme="dark"] .tm-step-title,
[data-theme="dark"] .tm-title { color: #e8e9f0; }
`;
  document.head.appendChild(style);

  /* ════════════════════════════════
     HTML STRUCTURE
  ════════════════════════════════ */
  const modals = {
    catalog: buildCatalogModal(),
    cart: buildCartModal(),
    payment: buildPaymentModal(),
  };

  Object.values(modals).forEach((m) => document.body.appendChild(m.overlay));

  /* close on backdrop click */
  document.querySelectorAll(".tm-overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeTutorialModal();
    });
  });

  /* ── keyboard ── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTutorialModal();
  });

  /* ════════════════════════════════
     MODAL: CATALOG
  ════════════════════════════════ */
  function buildCatalogModal() {
    const steps = [
      {
        emoji: "🔍",
        title: "Recherchez n'importe quoi",
        desc: "Tapez un nom de produit, une marque ou une spec dans la barre de recherche. Les résultats se mettent à jour <strong>en temps réel</strong>, sans rechargement de page.",
        tip: { icon: "💡", text: 'Essayez <strong>"RTX"</strong> ou <strong>"Keychron"</strong> pour trouver instantanément.' },
        scene: "catalog-search",
      },
      {
        emoji: "🎚️",
        title: "Filtrez par catégorie & prix",
        desc: "Utilisez la barre latérale pour choisir une catégorie, définir une fourchette de prix ou afficher uniquement les produits en promo ou en stock.",
        tip: { icon: "🎯", text: 'Combinez filtres et recherche pour un résultat ultra-précis.' },
        scene: "catalog-filter",
      },
      {
        emoji: "🛒",
        title: "Ajoutez au panier en un clic",
        desc: "Cliquez sur le bouton <strong>+</strong> d'un produit pour l'ajouter directement au panier, ou sur la carte pour voir tous les détails, specs et avis.",
        tip: { icon: "♡", text: 'Cliquez sur le cœur ♡ pour sauvegarder dans votre Wishlist.' },
        scene: "catalog-add",
      },
    ];
    return buildModal("catalog", "📦 Catalogue", steps);
  }

  /* ════════════════════════════════
     MODAL: CART
  ════════════════════════════════ */
  function buildCartModal() {
    const steps = [
      {
        emoji: "🔢",
        title: "Modifiez les quantités",
        desc: "Utilisez les boutons <strong>−</strong> et <strong>+</strong> à côté de chaque article pour ajuster la quantité. Le total se recalcule automatiquement.",
        tip: { icon: "✕", text: "Cliquez sur ✕ pour supprimer un article de votre panier." },
        scene: "cart-qty",
      },
      {
        emoji: "🏷️",
        title: "Appliquez un code promo",
        desc: 'Entrez le code <strong>DIGITAL10</strong> dans le champ prévu pour obtenir <strong>−10%</strong> sur votre commande. La réduction s\'applique immédiatement.',
        tip: { icon: "🎁", text: "D'autres codes sont partagés sur nos réseaux sociaux !" },
        scene: "cart-promo",
      },
      {
        emoji: "✅",
        title: "Passez la commande",
        desc: 'Cliquez sur <strong>"Passer la commande"</strong> pour accéder au paiement sécurisé. Vous gagnez des points de fidélité à chaque achat !',
        tip: { icon: "🌟", text: "1 point = 1 000 DA dépensé. Échangeables contre des réductions !" },
        scene: "cart-checkout",
      },
    ];
    return buildModal("cart", "🛒 Panier", steps);
  }

  /* ════════════════════════════════
     MODAL: PAYMENT
  ════════════════════════════════ */
  function buildPaymentModal() {
    const steps = [
      {
        emoji: "💳",
        title: "Choisissez votre méthode",
        desc: "Sélectionnez parmi <strong>CIB, Dahabia, CCP</strong> ou <strong>Paiement à la livraison</strong>. Le formulaire s'adapte automatiquement à votre choix.",
        tip: { icon: "🔒", text: "Toutes les transactions sont chiffrées en SSL 256 bits." },
        scene: "pay-method",
      },
      {
        emoji: "📝",
        title: "Remplissez vos coordonnées",
        desc: "Entrez votre adresse de livraison complète (prénom, nom, téléphone, wilaya) et vos informations de paiement. Tout est validé en temps réel.",
        tip: { icon: "📍", text: "Votre wilaya est pré-sélectionnée sur Sétif par défaut." },
        scene: "pay-form",
      },
      {
        emoji: "🎉",
        title: "Confirmez et suivez",
        desc: 'Cliquez sur <strong>"Confirmer et payer"</strong>. Vous recevrez un numéro de commande unique pour suivre votre livraison en temps réel sur la page Suivi.',
        tip: { icon: "📦", text: "Livraison 48–72h. Suivez votre colis sur la page Suivi !" },
        scene: "pay-confirm",
      },
    ];
    return buildModal("payment", "💰 Paiement", steps);
  }

  /* ════════════════════════════════
     GENERIC MODAL BUILDER
  ════════════════════════════════ */
  function buildModal(id, title, steps) {
    const overlay = document.createElement("div");
    overlay.className = "tm-overlay";
    overlay.id = `tm-overlay-${id}`;

    overlay.innerHTML = `
      <div class="tm-modal" id="tm-modal-${id}">
        <div class="tm-header">
          <div>
            <div class="tm-badge">✨ Tutoriel Interactif</div>
            <div class="tm-title">${title}</div>
          </div>
          <button class="tm-close" onclick="closeTutorialModal()">✕</button>
        </div>
        <div class="tm-steps-nav" id="tm-nav-${id}">
          ${steps.map((s, i) => `
            <button class="tm-step-pill ${i === 0 ? "active" : ""}" onclick="goTmStep('${id}',${i})">
              <span class="tm-step-num">${i + 1}</span> ${s.emoji} Étape ${i + 1}
            </button>
          `).join("")}
        </div>
        <div class="tm-body">
          <!-- Description -->
          <div class="tm-desc-panel">
            ${steps.map((s, i) => `
              <div class="tm-step-content ${i === 0 ? "active" : ""}" id="tm-step-${id}-${i}">
                <div>
                  <div class="tm-step-emoji">${s.emoji}</div>
                  <div class="tm-step-title">${s.title}</div>
                  <div class="tm-step-desc" style="margin-top:10px">${s.desc}</div>
                  <div class="tm-tip" style="margin-top:14px">
                    <span class="tm-tip-icon">${s.tip.icon}</span>
                    <span>${s.tip.text}</span>
                  </div>
                </div>
              </div>
            `).join("")}
            <div class="tm-progress">
              <div class="tm-progress-track">
                <div class="tm-progress-fill" id="tm-prog-${id}" style="width:${Math.round(100/steps.length)}%"></div>
              </div>
              <div class="tm-progress-text" id="tm-prog-text-${id}">Étape 1 sur ${steps.length}</div>
            </div>
            <div class="tm-nav">
              <button class="tm-btn-prev" id="tm-prev-${id}" disabled onclick="tmNavStep('${id}',-1)">←</button>
              <button class="tm-btn-next" id="tm-next-${id}" onclick="tmNavStep('${id}',1)">
                Suivant <span>→</span>
              </button>
            </div>
          </div>
          <!-- Animation panel -->
          <div class="tm-anim-panel" id="tm-anim-${id}">
            ${buildScenes(id, steps)}
          </div>
        </div>
      </div>
    `;

    return { overlay, id, steps, current: 0 };
  }

  /* ════════════════════════════════
     SCENES HTML
  ════════════════════════════════ */
  function buildScenes(id, steps) {
    return steps.map((s, i) => `
      <div class="tm-scene ${i === 0 ? "active" : ""}" id="tm-scene-${id}-${i}">
        ${buildSceneContent(id, s.scene, i)}
      </div>
    `).join("");
  }

  function buildSceneContent(modalId, scene) {
    if (scene === "catalog-search") return `
      <div style="position:relative;width:100%;height:100%;min-height:280px">
        <div class="tm-search-mock" id="tm-srch-mock">🔍 <span class="tm-search-typing" id="tm-srch-txt"></span></div>
        <div class="tm-cat-sidebar">
          <div class="tm-cat-pill"></div>
          <div class="tm-cat-pill highlighted"></div>
          <div class="tm-cat-pill"></div>
          <div class="tm-cat-pill"></div>
          <div class="tm-cat-pill"></div>
        </div>
        <div class="tm-mini-cards">
          <div class="tm-mini-card" id="tm-card1">
            <div class="tm-card-thumb">🖥️</div>
            <div class="tm-card-lines">
              <div class="tm-card-line teal"></div>
              <div class="tm-card-line short"></div>
            </div>
            <div class="tm-add-badge">+</div>
          </div>
          <div class="tm-mini-card" id="tm-card2">
            <div class="tm-card-thumb">⌨️</div>
            <div class="tm-card-lines">
              <div class="tm-card-line"></div>
              <div class="tm-card-line short"></div>
            </div>
            <div class="tm-add-badge">+</div>
          </div>
          <div class="tm-mini-card" id="tm-card3">
            <div class="tm-card-thumb">🖱️</div>
            <div class="tm-card-lines">
              <div class="tm-card-line"></div>
              <div class="tm-card-line short"></div>
            </div>
            <div class="tm-add-badge">+</div>
          </div>
        </div>
        <div class="tm-hand" style="bottom:90px;right:68px;animation:handCardHover 4s ease-in-out infinite">👆</div>
      </div>`;

    if (scene === "catalog-filter") return `
      <div style="position:relative;width:100%;height:100%;min-height:280px">
        <div class="tm-cat-sidebar" style="top:20px">
          <div class="tm-cat-pill" style="width:90%"></div>
          <div class="tm-cat-pill highlighted" style="width:100%"></div>
          <div class="tm-cat-pill" style="width:75%"></div>
          <div class="tm-cat-pill" style="width:85%"></div>
          <div class="tm-cat-pill" style="width:60%"></div>
          <div style="height:1px;background:var(--border,#e2e2df);margin:4px 0"></div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <div style="height:18px;border:1px solid var(--border,#e2e2df);border-radius:4px;background:var(--surface2,#eeeeeb);font-size:8px;padding:0 4px;display:flex;align-items:center;color:var(--muted,#7a7a76)">Min</div>
            <div style="height:18px;border:1px solid var(--teal,#497b89);border-radius:4px;font-size:8px;padding:0 4px;display:flex;align-items:center;color:var(--teal,#497b89);font-weight:700">Max</div>
          </div>
        </div>
        <div class="tm-mini-cards">
          <div class="tm-mini-card hovered">
            <div class="tm-card-thumb">🎮</div>
            <div class="tm-card-lines">
              <div class="tm-card-line teal"></div>
              <div class="tm-card-line short"></div>
            </div>
            <div class="tm-add-badge">+</div>
          </div>
          <div class="tm-mini-card">
            <div class="tm-card-thumb">💾</div>
            <div class="tm-card-lines">
              <div class="tm-card-line"></div>
              <div class="tm-card-line short"></div>
            </div>
            <div class="tm-add-badge">+</div>
          </div>
        </div>
        <div class="tm-hand" style="bottom:140px;left:22px;animation:handFilterClick 3.5s ease-in-out infinite">☝️</div>
      </div>`;

    if (scene === "catalog-add") return `
      <div style="position:relative;width:100%;height:100%;min-height:280px">
        <div class="tm-search-mock" style="top:8px;left:96px;right:12px">🔍 <span style="font-size:10px;color:var(--muted,#7a7a76)">RTX 4070 Super…</span></div>
        <div class="tm-cat-sidebar"></div>
        <div class="tm-mini-cards" style="top:46px">
          <div class="tm-mini-card hovered" style="flex:none;height:auto;padding:10px">
            <div class="tm-card-thumb" style="width:46px;height:46px;font-size:24px">🎮</div>
            <div class="tm-card-lines" style="gap:5px">
              <div class="tm-card-line teal" style="height:9px"></div>
              <div class="tm-card-line short" style="height:7px"></div>
              <div class="tm-card-line" style="height:7px;width:90%"></div>
            </div>
            <div class="tm-add-badge" style="width:30px;height:30px;font-size:18px">+</div>
          </div>
          <div class="tm-mini-card" style="flex:none;height:auto;padding:10px">
            <div class="tm-card-thumb" style="width:46px;height:46px;font-size:24px">⌨️</div>
            <div class="tm-card-lines" style="gap:5px">
              <div class="tm-card-line" style="height:9px"></div>
              <div class="tm-card-line short" style="height:7px"></div>
            </div>
            <div class="tm-add-badge" style="width:30px;height:30px;font-size:18px">+</div>
          </div>
        </div>
        <div class="tm-hand" style="bottom:50px;right:30px;animation:handAddClick 3.8s ease-in-out infinite">👆</div>
      </div>`;

    if (scene === "cart-qty") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:8px;padding:16px">
        <div class="tm-cart-item-mock">
          <div class="tm-ci-thumb">🖥️</div>
          <div class="tm-ci-info">
            <div class="tm-ci-line"></div>
            <div class="tm-ci-line short"></div>
          </div>
          <div class="tm-qty-mock">
            <div class="tm-qty-b">−</div>
            <div class="tm-qty-v" id="tm-qty-val">2</div>
            <div class="tm-qty-b">+</div>
          </div>
          <div class="tm-ci-price">149 900 DA</div>
        </div>
        <div class="tm-cart-item-mock">
          <div class="tm-ci-thumb">⌨️</div>
          <div class="tm-ci-info">
            <div class="tm-ci-line"></div>
            <div class="tm-ci-line short"></div>
          </div>
          <div class="tm-qty-mock">
            <div class="tm-qty-b">−</div>
            <div class="tm-qty-v">1</div>
            <div class="tm-qty-b">+</div>
          </div>
          <div class="tm-ci-price">84 900 DA</div>
        </div>
        <div class="tm-hand" style="bottom:120px;right:52px;animation:handQtyClick 3.5s ease-in-out infinite">👆</div>
      </div>`;

    if (scene === "cart-promo") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:8px;padding:16px">
        <div class="tm-cart-item-mock">
          <div class="tm-ci-thumb">🖥️</div>
          <div class="tm-ci-info">
            <div class="tm-ci-line"></div>
            <div class="tm-ci-line short"></div>
          </div>
          <div class="tm-ci-price">749 900 DA</div>
        </div>
        <div class="tm-summary-mock">
          <div class="tm-sum-row"><span class="tm-sum-lbl">Sous-total</span><span class="tm-sum-val">749 900 DA</span></div>
          <div class="tm-sum-row"><span class="tm-sum-lbl">Livraison</span><span style="color:#15803d;font-weight:700;font-size:11px">Gratuite</span></div>
          <div class="tm-promo-row">
            <div class="tm-promo-input active" id="tm-promo-in">DIGITAL10</div>
            <div class="tm-promo-btn">Appliquer</div>
          </div>
          <div class="tm-sum-row" style="color:#15803d"><span class="tm-sum-lbl" style="color:#15803d">Réduction</span><span style="font-weight:700;font-size:11px">-74 990 DA</span></div>
          <div class="tm-sum-total"><span>Total TTC</span><span style="color:var(--teal,#497b89)">793 904 DA</span></div>
        </div>
        <div class="tm-hand" style="bottom:106px;left:56px;animation:handPromoType 4s ease-in-out infinite 1.8s">☝️</div>
      </div>`;

    if (scene === "cart-checkout") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:8px;padding:16px">
        <div class="tm-summary-mock">
          <div class="tm-sum-row"><span class="tm-sum-lbl">Sous-total</span><span class="tm-sum-val">749 900 DA</span></div>
          <div class="tm-sum-row"><span class="tm-sum-lbl">Livraison</span><span style="color:#15803d;font-weight:700;font-size:11px">Gratuite</span></div>
          <div class="tm-sum-row" style="color:#15803d"><span class="tm-sum-lbl" style="color:#15803d">DIGITAL10</span><span style="font-weight:700;font-size:11px">-74 990 DA</span></div>
          <div class="tm-sum-total"><span>Total TTC</span><span style="color:var(--teal,#497b89)">793 904 DA</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:10px;color:var(--teal,#497b89)"><span>Points à gagner</span><span style="font-weight:700">+793 pts 🌟</span></div>
          <div class="tm-checkout-btn pulse">✅ Passer la commande</div>
        </div>
        <div class="tm-hand" style="bottom:28px;left:50%;transform:translateX(-50%) rotate(-5deg);animation:handCheckout 4s ease-in-out infinite 3.5s">👆</div>
      </div>`;

    if (scene === "pay-method") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:10px;padding:16px">
        <div class="tm-secure-badge">🔒 SSL 256 bits — Vos données sont protégées</div>
        <div class="tm-pay-methods-mock">
          <div class="tm-pay-m selected"><span>💳</span><span class="tm-pay-m-lbl">CIB</span></div>
          <div class="tm-pay-m"><span>🟡</span><span class="tm-pay-m-lbl">Dahabia</span></div>
          <div class="tm-pay-m"><span>🟠</span><span class="tm-pay-m-lbl">CCP</span></div>
          <div class="tm-pay-m"><span>💵</span><span class="tm-pay-m-lbl">Livraison</span></div>
        </div>
        <div class="tm-card-visual">
          <div style="display:flex;gap:6px;align-items:center">
            <div style="width:26px;height:18px;background:rgba(255,215,0,.8);border-radius:3px"></div>
          </div>
          <div>
            <div class="tm-card-num">•••• •••• •••• 4812</div>
            <div class="tm-card-bottom">
              <div><div class="tm-card-name">AHMED BENALI</div></div>
              <div class="tm-card-exp">12/28</div>
            </div>
          </div>
        </div>
        <div class="tm-hand" style="bottom:170px;left:28px;animation:handSelectMethod 3.5s ease-in-out infinite">☝️</div>
      </div>`;

    if (scene === "pay-form") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:8px;padding:16px">
        <div class="tm-secure-badge">📦 Adresse de livraison</div>
        <div class="tm-form-mock">
          <div class="tm-fields-row">
            <div class="tm-field-mock focused"><span class="tm-field-typing">Ahmed</span></div>
            <div class="tm-field-mock">Benali</div>
          </div>
          <div class="tm-field-mock focused"><span class="tm-field-typing">0550 123 456</span></div>
          <div class="tm-field-mock">Rue Krim Belkacem, Sétif</div>
          <div class="tm-fields-row">
            <div class="tm-field-mock" style="color:var(--teal,#497b89);font-weight:700;font-size:9px">Sétif ✓</div>
            <div class="tm-field-mock">19000</div>
          </div>
        </div>
        <div class="tm-hand" style="top:110px;right:32px;animation:handFillField 3.8s ease-in-out infinite 2s">👆</div>
      </div>`;

    if (scene === "pay-confirm") return `
      <div style="position:relative;width:100%;display:flex;flex-direction:column;gap:10px;padding:16px">
        <div class="tm-secure-badge">🔒 SSL 256 bits</div>
        <div class="tm-summary-mock">
          <div style="font-size:10px;font-weight:700;color:var(--muted,#7a7a76);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Récapitulatif</div>
          <div class="tm-sum-row"><span class="tm-sum-lbl">RTX 4070 Super × 1</span><span class="tm-sum-val">629 900 DA</span></div>
          <div class="tm-sum-row"><span class="tm-sum-lbl">DIGITAL10</span><span style="color:#15803d;font-weight:700;font-size:10px">-74 990 DA</span></div>
          <div class="tm-sum-total"><span>Total TTC</span><span style="color:var(--teal,#497b89)">662 900 DA</span></div>
        </div>
        <div class="tm-submit-mock" id="tm-submit-anim">🔒 Confirmer et payer — 662 900 DA</div>
        <div class="tm-hand" style="bottom:22px;left:50%;transform:translateX(-50%);animation:handSubmitPay 4s ease-in-out infinite 4s">👆</div>
        <!-- Success overlay (animated) -->
        <div id="tm-success-ov" style="position:absolute;inset:0;background:rgba(21,128,61,0.92);border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;opacity:0;animation:tmSuccessAppear 8s ease-in-out infinite 6s;pointer-events:none">
          <div style="font-size:48px;animation:tmBounce 0.5s ease">✅</div>
          <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:#fff">Commande confirmée !</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:rgba(255,255,255,.8)">DS-2026-8472</div>
          <div style="font-size:13px;color:rgba(255,255,255,.8);display:flex;align-items:center;gap:5px">🌟 +662 pts gagnés</div>
        </div>
      </div>`;

    return `<div style="padding:20px;color:var(--muted,#7a7a76)">Scène non trouvée</div>`;
  }

  /* ════════════════════════════════
     Add success animation keyframe
  ════════════════════════════════ */
  const extraAnim = document.createElement("style");
  extraAnim.textContent = `
    @keyframes tmSuccessAppear {
      0%,55%   { opacity:0; transform:scale(0.96); }
      60%      { opacity:1; transform:scale(1); }
      85%      { opacity:1; }
      95%,100% { opacity:0; }
    }
    @keyframes tmBounce {
      0%   { transform:scale(0); }
      70%  { transform:scale(1.2); }
      100% { transform:scale(1); }
    }
  `;
  document.head.appendChild(extraAnim);

  /* ════════════════════════════════
     STATE
  ════════════════════════════════ */
  const state = { catalog: 0, cart: 0, payment: 0 };
  const stepCounts = { catalog: 3, cart: 3, payment: 3 };
  let activeModal = null;

  /* ════════════════════════════════
     PUBLIC API
  ════════════════════════════════ */
  window.openTutorialModal = function (id) {
    closeTutorialModal();
    state[id] = 0;
    renderTmStep(id, 0);
    document.getElementById(`tm-overlay-${id}`).classList.add("open");
    activeModal = id;
    document.body.style.overflow = "hidden";
  };

  window.closeTutorialModal = function () {
    document.querySelectorAll(".tm-overlay").forEach((o) => o.classList.remove("open"));
    activeModal = null;
    document.body.style.overflow = "";
  };

  window.goTmStep = function (id, step) {
    state[id] = step;
    renderTmStep(id, step);
  };

  window.tmNavStep = function (id, dir) {
    const total = stepCounts[id];
    const next = state[id] + dir;
    if (next >= total) { closeTutorialModal(); return; }
    state[id] = Math.max(0, next);
    renderTmStep(id, state[id]);
  };

  function renderTmStep(id, step) {
    const total = stepCounts[id];

    /* pills */
    document.querySelectorAll(`#tm-nav-${id} .tm-step-pill`).forEach((p, i) => {
      p.classList.toggle("active", i === step);
    });

    /* content */
    document.querySelectorAll(`[id^="tm-step-${id}-"]`).forEach((el) => el.classList.remove("active"));
    const sc = document.getElementById(`tm-step-${id}-${step}`);
    if (sc) { sc.classList.remove("active"); void sc.offsetWidth; sc.classList.add("active"); }

    /* scenes */
    document.querySelectorAll(`#tm-anim-${id} .tm-scene`).forEach((s) => s.classList.remove("active"));
    const scene = document.getElementById(`tm-scene-${id}-${step}`);
    if (scene) { scene.classList.remove("active"); void scene.offsetWidth; scene.classList.add("active"); }

    /* progress */
    const pct = Math.round(((step + 1) / total) * 100);
    const prog = document.getElementById(`tm-prog-${id}`);
    const progTxt = document.getElementById(`tm-prog-text-${id}`);
    if (prog) prog.style.width = pct + "%";
    if (progTxt) progTxt.textContent = `Étape ${step + 1} sur ${total}`;

    /* buttons */
    const prev = document.getElementById(`tm-prev-${id}`);
    const next = document.getElementById(`tm-next-${id}`);
    if (prev) prev.disabled = step === 0;
    if (next) next.innerHTML = step === total - 1 ? "✅ Terminer" : "Suivant <span>→</span>";
  }

  /* ════════════════════════════════
     SEARCH TYPING ANIMATION
  ════════════════════════════════ */
  const searchWords = ["RTX 4070", "Keychron Q3", "ASUS ProArt", "Logitech MX"];
  let swIdx = 0, charIdx = 0, typing = true;
  function animateSearchType() {
    const el = document.getElementById("tm-srch-txt");
    if (!el) { setTimeout(animateSearchType, 300); return; }
    const word = searchWords[swIdx];
    if (typing) {
      el.textContent = word.substring(0, charIdx + 1);
      charIdx++;
      if (charIdx >= word.length) { typing = false; setTimeout(animateSearchType, 1200); return; }
    } else {
      el.textContent = word.substring(0, charIdx - 1);
      charIdx--;
      if (charIdx <= 0) { typing = true; swIdx = (swIdx + 1) % searchWords.length; setTimeout(animateSearchType, 400); return; }
    }
    setTimeout(animateSearchType, typing ? 80 : 45);
  }
  animateSearchType();

  /* ════════════════════════════════
     INJECT TUTORIAL BUTTONS (optional helpers)
  ════════════════════════════════ */
  // You can also call openTutorialModal('catalog'), openTutorialModal('cart'), openTutorialModal('payment')
  // from any button in your HTML. Example already done via addTutorialButtons().
  function addTutorialButtons() {
    // Small floating "?" buttons injected near each page title
    // Only injected if the page element exists
    const targets = [
      { page: "page-catalog", modal: "catalog", label: "📦 Tutoriel Catalogue" },
      { page: "page-cart", modal: "cart", label: "🛒 Tutoriel Panier" },
    ];
    targets.forEach(({ page, modal, label }) => {
      const pageEl = document.getElementById(page);
      if (!pageEl) return;
      const btn = document.createElement("button");
      btn.className = "tut-nav-btn";
      btn.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:800;font-size:13px;";
      btn.innerHTML = `✨ ${label}`;
      btn.onclick = () => openTutorialModal(modal);
      // Don't inject floating — let the nav guide button handle it
    });
  }

  console.log(
    "%c DigitalStore Tutorials Ready! ",
    "background:#497b89;color:#fff;font-weight:bold;padding:4px 10px;border-radius:6px",
    "\nCall: openTutorialModal('catalog') | openTutorialModal('cart') | openTutorialModal('payment')"
  );
})();











// Ouvre le menu principal (Hub)
window.openTutorialHub = function() {
    const hub = document.getElementById('tm-hub-overlay');
    hub.classList.add('open');
    document.body.style.overflow = 'hidden';
};

// Ferme le menu principal
window.closeTutorialHub = function(e) {
    if (e && e.target !== document.getElementById('tm-hub-overlay') && e.target.className !== 'tm-close') return;
    document.getElementById('tm-hub-overlay').classList.remove('open');
    document.body.style.overflow = '';
};

// Lance un tutoriel depuis le Hub
window.startFromHub = function(modalId) {
    // 1. Fermer le Hub
    document.getElementById('tm-hub-overlay').classList.remove('open');
    
    // 2. Ouvrir le tutoriel choisi (après un micro-délai pour l'animation)
    setTimeout(() => {
        openTutorialModal(modalId);
    }, 300);
};