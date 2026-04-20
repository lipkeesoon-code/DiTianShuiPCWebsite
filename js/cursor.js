/**
 * ZiWi Custom Cursor — Star Kite Tail  (v2 — Smooth Edition)
 * ──────────────────────────────────────────────────────────
 * Optimisations vs v1:
 *  • Circular buffer (ring) for path history → no array shifts
 *  • Offscreen canvas for cursor arrow (draw once, blit each frame)
 *  • Star positions lerped smoothly along the path arc-length
 *  • Retract via continuous float (retractLevel 14→0) driven by rAF,
 *    no setInterval jitter
 *  • Font set once outside loop
 *  • globalAlpha compositing only when needed
 */
(function () {
    'use strict';

    /* ══════════════════════ CONFIG ══════════════════════ */
    const STAR_COLOR_PURPLE = '#7c30a6';   // C60 M77 Y0 K0
    const STAR_COLOR_PINK   = '#d44db3';   // C11 M80 Y0 K0
    const STAR_COLOR_GRAY   = '#5d5d5d';   // K63
    const CURSOR_COLOR      = '#7c30a6';
    const FONT_SIZE_PX      = 14;          // tail star name size
    const CURSOR_SIZE       = 26;
    const TAIL_STEP_PX      = 40;          // arc-length between stars
    const RETRACT_SPEED     = 0.18;        // fraction per frame
    const IDLE_BEFORE_RETRACT_MS = 350;    // wait after stop before retract begins

    const STARS = [
        { name: '紫微', color: STAR_COLOR_PURPLE },
        { name: '天机', color: STAR_COLOR_PURPLE },
        { name: '太阳', color: STAR_COLOR_PINK   },
        { name: '武曲', color: STAR_COLOR_PURPLE },
        { name: '天同', color: STAR_COLOR_PURPLE },
        { name: '廉贞', color: STAR_COLOR_PURPLE },
        { name: '天府', color: STAR_COLOR_PURPLE },
        { name: '太阴', color: STAR_COLOR_PINK   },
        { name: '贪狼', color: STAR_COLOR_PURPLE },
        { name: '巨门', color: STAR_COLOR_PURPLE },
        { name: '天相', color: STAR_COLOR_PURPLE },
        { name: '天梁', color: STAR_COLOR_PURPLE },
        { name: '七杀', color: STAR_COLOR_PURPLE },
        { name: '破军', color: STAR_COLOR_PURPLE },
        { name: '左辅', color: STAR_COLOR_GRAY   },
        { name: '右弼', color: STAR_COLOR_GRAY   },
        { name: '文曲', color: STAR_COLOR_GRAY   },
        { name: '文昌', color: STAR_COLOR_GRAY   },
    ];
    const N = STARS.length; // 18

    /* ══════════════════════ STATE ══════════════════════ */
    let mouseX = -999, mouseY = -999;
    let isMoving = false;
    let idleTimer = null;

    // retractLevel: float N → 0
    let retractLevel = 0;
    let retracting   = false;
    
    // Toggle state: true = tail active, false = only purple arrow
    let tailEnabled  = false;

    /* ── Ring buffer for mouse path ── */
    const RING_SIZE = N * TAIL_STEP_PX + 120; // enough samples for all 18 stars
    const ring = new Float32Array(RING_SIZE * 2); // [x0,y0, x1,y1, ...]
    let ringHead = 0;   // index of most-recent sample
    let ringCount = 0;  // how many valid samples

    function ringPush(x, y) {
        ringHead = (ringHead + 1) % RING_SIZE;
        ring[ringHead * 2]     = x;
        ring[ringHead * 2 + 1] = y;
        if (ringCount < RING_SIZE) ringCount++;
    }

    function ringGet(offset) {
        // offset 0 = newest, positive = older
        const idx = ((ringHead - offset) % RING_SIZE + RING_SIZE) % RING_SIZE;
        return { x: ring[idx * 2], y: ring[idx * 2 + 1] };
    }

    /* ══════════════════════ CANVAS ══════════════════════ */
    const canvas = document.createElement('canvas');
    canvas.id = 'cursor-canvas';
    Object.assign(canvas.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: '99999',
    });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });

    /* Offscreen arrow — drawn once */
    const arrowOff = document.createElement('canvas');
    arrowOff.width = arrowOff.height = CURSOR_SIZE + 4;
    const actx = arrowOff.getContext('2d');
    (function buildArrow() {
        const s = CURSOR_SIZE;
        actx.beginPath();
        actx.moveTo(2, 2);
        actx.lineTo(2, 2 + s * 0.85);
        actx.lineTo(2 + s * 0.22, 2 + s * 0.65);
        actx.lineTo(2 + s * 0.42, 2 + s);
        actx.lineTo(2 + s * 0.54, 2 + s * 0.95);
        actx.lineTo(2 + s * 0.34, 2 + s * 0.60);
        actx.lineTo(2 + s * 0.58, 2 + s * 0.58);
        actx.closePath();
        actx.fillStyle = CURSOR_COLOR;
        actx.fill();
        actx.strokeStyle = 'rgba(255,255,255,0.6)';
        actx.lineWidth = 1.2;
        actx.stroke();
    })();

    function resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    /* ══════════════════════ HIDE NATIVE ══════════════════════ */
    document.documentElement.style.cursor = 'none';
    const styleTag = document.createElement('style');
    styleTag.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(styleTag);

    /* ══════════════════════ RENDER LOOP ══════════════════════ */
    ctx.font = `bold ${FONT_SIZE_PX}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;

    function render() {
        requestAnimationFrame(render);

        /* 1. Update retract float */
        if (retracting) {
            if (retractLevel > 0) {
                retractLevel = Math.max(0, retractLevel - RETRACT_SPEED);
            } else {
                retracting = false;
                ringCount  = 0; // clear path once fully retracted
            }
        }

        /* 2. Clear */
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* 3. Draw tail */
        const visible = Math.ceil(retractLevel); // 0-14 integer
        if (visible > 0 && ringCount >= 2) {
            ctx.save();
            ctx.font = `bold ${FONT_SIZE_PX}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
            ctx.textBaseline = 'middle';

            // Walk arc-length along ring to find star positions
            // We measure cumulative distance stepping through ring backwards
            let cumDist = 0;
            let prevPt  = ringGet(0);
            let sIdx    = 0;             // next star to place
            const targetDists = [];
            for (let s = 0; s < visible; s++) targetDists.push((s + 1) * TAIL_STEP_PX);

            for (let off = 1; off < ringCount && sIdx < visible; off++) {
                const pt  = ringGet(off);
                const dx  = prevPt.x - pt.x;
                const dy  = prevPt.y - pt.y;
                const seg = Math.sqrt(dx * dx + dy * dy);
                const prevDist = cumDist;
                cumDist += seg;

                while (sIdx < visible && targetDists[sIdx] <= cumDist) {
                    // Interpolate exact position
                    const t = seg > 0 ? (targetDists[sIdx] - prevDist) / seg : 0;
                    const px = prevPt.x - dx * t;
                    const py = prevPt.y - dy * t;

                    const star  = STARS[sIdx];
                    // Fade factor: last star fades out smoothly during retract
                    // retractLevel can be e.g. 13.7 meaning star 14 is 70% visible
                    let alpha = 1;
                    if (!isMoving && sIdx === visible - 1) {
                        alpha = retractLevel - Math.floor(retractLevel);
                        if (alpha < 0.01) alpha = 1; // fully integer step
                    }
                    // General fade toward tail end
                    alpha *= Math.max(0.22, 1 - sIdx * 0.04);

                    ctx.globalAlpha = alpha;
                    ctx.fillStyle   = star.color;

                    // Name first, then dot immediately after
                    ctx.fillText(star.name, px, py);
                    const nameW = ctx.measureText(star.name).width;

                    // Dot separator — same color as star
                    ctx.beginPath();
                    ctx.arc(px + nameW + 4, py, 2.2, 0, Math.PI * 2);
                    ctx.fill();

                    sIdx++;
                }
                prevPt = pt;
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        /* 4. Draw arrow (blit offscreen) */
        ctx.drawImage(arrowOff, mouseX, mouseY);
    }

    requestAnimationFrame(render);

    /* ══════════════════════ MOUSE TRACKING ══════════════════════ */
    let lastPushX = -9999, lastPushY = -9999;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        const dx = mouseX - lastPushX;
        const dy = mouseY - lastPushY;

        if (!tailEnabled) return; // Skip tail logic completely if turned off

        // Only push if moved ≥ 1.5 px — avoids micro-jitter samples
        if (dx * dx + dy * dy >= 2.25) {
            ringPush(mouseX, mouseY);
            lastPushX = mouseX;
            lastPushY = mouseY;
        }

        // Moving: expand tail fully
        if (!isMoving) {
            isMoving     = true;
            retracting   = false;
            retractLevel = N;
        } else {
            retractLevel = N; // keep full while moving
            retracting   = false;
        }

        // Reset idle timer
        clearTimeout(idleTimer);
        idleTimer = setTimeout(beginRetract, IDLE_BEFORE_RETRACT_MS);
    }, { passive: true });

    function beginRetract() {
        isMoving   = false;
        retracting = true;
        // retractLevel will count down in render()
    }
    
    /* ══════════════════════ TOGGLE CONTROLS ══════════════════════ */
    document.addEventListener('DOMContentLoaded', () => {
        const cursorBtn = document.getElementById('cursor-btn');
        if (cursorBtn) {
            cursorBtn.addEventListener('click', () => {
                tailEnabled = !tailEnabled;
                
                if (!tailEnabled) {
                    // Turn off instantly
                    isMoving = false;
                    retracting = false;
                    retractLevel = 0;
                    ringCount = 0;
                    clearTimeout(idleTimer);
                }
            });
        }
    });

})();
