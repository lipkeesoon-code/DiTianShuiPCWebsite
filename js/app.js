// app.js - Di Tian Shui BaZi Edition

const State = {
    groups: JSON.parse(localStorage.getItem('ziwi_groups')) || [{ id: 'default', name: '默认群组' }],
    records: JSON.parse(localStorage.getItem('ziwi_records')) || [],
    defaultGroupId: localStorage.getItem('ziwi_default_group') || '',
    currentActiveRecord: null,
    isLoggedIn: localStorage.getItem('ziwi_auth') === 'true',
    lastUsedGroupId: localStorage.getItem('ziwi_last_used_group') || '',
    collapsedGroups: new Set(JSON.parse(localStorage.getItem('ziwi_collapsed_groups')) || []),
    browsingYear: 2026,
    browsingLuckIndex: -1,  // -1 means auto-calculate from browsingYear
    browsingMonthIndex: -1 // -1 means auto-calculate (default to current month)
};


const UI = {
    phoneContainer: document.getElementById('phone-container'),
    bottomNav: document.getElementById('bottom-nav'),
    views: document.querySelectorAll('.app-view'),
    navItems: document.querySelectorAll('.nav-item'),
    
    // Login
    loginEmail: document.getElementById('login-email'),
    loginPass: document.getElementById('login-pass'),
    btnLogin: document.getElementById('btn-login'),
    loginError: document.getElementById('login-error'),
    
    // Input
    gregYear: document.getElementById('greg-year'),
    gregMonth: document.getElementById('greg-month'),
    gregDay: document.getElementById('greg-day'),
    gregTime: document.getElementById('greg-time'),
    lunarDisplay: document.getElementById('lunar-date-display'),
    userName: document.getElementById('user-name'),
    btnSaveChart: document.getElementById('btn-save-chart'),
    btnNewChart: document.getElementById('btn-new-chart'),

    // Records
    groupList: document.getElementById('group-list'),
    addGroupBtn: document.getElementById('add-group-btn'),

    // Context Menu
    contextMenu: document.getElementById('context-menu'),
    menuRename: document.getElementById('menu-rename'),
    menuDelete: document.getElementById('menu-delete'),
    
    // Main Board
    mainBoard: document.getElementById('chart-area-mobile'),
    cName: document.getElementById('c-name'),
    cGregorian: document.getElementById('c-gregorian'),
    cLunar: document.getElementById('c-lunar'),
    cGender: document.getElementById('c-gender'),
    cAge: document.getElementById('c-age'),
    
    // Global Funcs
    snapshotBtn: document.getElementById('snapshot-btn'),
    backupBtn: document.getElementById('backup-btn'),
    importBtn: document.getElementById('import-btn'),
    importFileInput: document.getElementById('import-file-input'),
    refreshBtn: document.getElementById('refresh-btn'),
    bgChangeBtn: document.getElementById('bg-change-btn'),
    bgUploadInput: document.getElementById('bg-upload-input'),
    bgLayer: document.getElementById('bg-layer'),
    btnLogoutSystem: document.getElementById('btn-logout-system')
};

// --- Context Menu State & Logic ---
const ContextMenuState = {
    visible: false,
    targetType: null, // 'group' or 'record'
    targetData: null,
    longPressTimer: null
};

function showContextMenu(e, type, data) {
    e.preventDefault();
    e.stopPropagation();
    
    ContextMenuState.visible = true;
    ContextMenuState.targetType = type;
    ContextMenuState.targetData = data;
    
    UI.contextMenu.style.display = 'block';
    
    // Position menu
    let x = e.pageX || (e.touches ? e.touches[0].pageX : 0);
    let y = e.pageY || (e.touches ? e.touches[0].pageY : 0);
    
    // Constrain to screen
    const menuWidth = 120;
    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    
    UI.contextMenu.style.left = x + 'px';
    UI.contextMenu.style.top = y + 'px';
}

function hideContextMenu() {
    ContextMenuState.visible = false;
    UI.contextMenu.style.display = 'none';
}

function handleManagementEvents(el, type, data) {
    // 1. Right Click (PC)
    el.oncontextmenu = (e) => showContextMenu(e, type, data);
    
    // 2. Long Press (Mobile)
    el.ontouchstart = (e) => {
        ContextMenuState.longPressTimer = setTimeout(() => {
            showContextMenu(e, type, data);
        }, 600);
    };
    el.ontouchend = () => {
        if (ContextMenuState.longPressTimer) clearTimeout(ContextMenuState.longPressTimer);
    };
    el.ontouchmove = () => {
        if (ContextMenuState.longPressTimer) clearTimeout(ContextMenuState.longPressTimer);
    };
}

function handleRename() {
    const { targetType, targetData } = ContextMenuState;
    if (!targetData) return;
    
    const oldName = targetType === 'group' ? targetData.name : targetData.name;
    const newName = prompt("请输入新名称:", oldName);
    
    if (newName && newName.trim() !== "") {
        if (targetType === 'group') {
            const group = State.groups.find(g => g.id === targetData.id);
            if (group) group.name = newName.trim();
        } else {
            const record = State.records.find(r => r.id === targetData.id);
            if (record) record.name = newName.trim();
        }
        saveState();
        renderGroups();
    }
    hideContextMenu();
}

function handleDelete() {
    const { targetType, targetData } = ContextMenuState;
    if (!targetData) return;
    
    if (confirm(`确定要删除 ${targetType === 'group' ? '群组' : '记录'}: ${targetData.name} 吗？`)) {
        if (targetType === 'group') {
            if (targetData.id === 'default') {
                alert("默认群组不能删除。");
            } else {
                State.groups = State.groups.filter(g => g.id !== targetData.id);
                State.records.filter(r => r.groupId === targetData.id).forEach(r => r.groupId = 'default');
            }
        } else {
            State.records = State.records.filter(r => r.id !== targetData.id);
        }
        saveState();
        renderGroups();
    }
    hideContextMenu();
}

// --- View Router ---
function switchView(viewId) {
    UI.views.forEach(v => v.classList.remove('active'));
    UI.navItems.forEach(item => item.classList.remove('active'));

    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    const targetNav = Array.from(UI.navItems).find(i => i.dataset.view === viewId);
    if (targetNav) targetNav.classList.add('active');
}

// --- Auth System ---
const ADMIN_EMAIL = "lipkeesoon@hotmail.com";
const ADMIN_PASS = "matahari521413";

function checkAuth() {
    if (State.isLoggedIn) {
        UI.bottomNav.style.display = 'flex';
        switchView('view-records'); // Landing page set to records list
    } else {
        UI.bottomNav.style.display = 'none';
        switchView('view-login');
    }
}

UI.btnLogin.onclick = () => {
    const email = UI.loginEmail.value.trim().toLowerCase();
    const pass = UI.loginPass.value.trim();
    if (email === ADMIN_EMAIL.toLowerCase() && pass === ADMIN_PASS) {
        State.isLoggedIn = true;
        localStorage.setItem('ziwi_auth', 'true');
        checkAuth();
    } else {
        UI.loginError.textContent = "账户或密码错误，请检查输入。";
    }
};

// --- Core Data Logic ---
function saveState() {
    localStorage.setItem('ziwi_groups', JSON.stringify(State.groups));
    localStorage.setItem('ziwi_records', JSON.stringify(State.records));
    localStorage.setItem('ziwi_collapsed_groups', JSON.stringify([...State.collapsedGroups]));
    localStorage.setItem('ziwi_last_used_group', State.lastUsedGroupId || '');
}

const TimePeriods = [
    { zhi: "子", label: "子时 (11pm-1am)" }, { zhi: "丑", label: "丑时 (1am-3am)" },
    { zhi: "寅", label: "寅时 (3am-5am)" }, { zhi: "卯", label: "卯时 (5am-7am)" },
    { zhi: "辰", label: "辰时 (7am-9am)" }, { zhi: "巳", label: "巳时 (9am-11am)" },
    { zhi: "午", label: "午时 (11am-1pm)" }, { zhi: "未", label: "未时 (1pm-3pm)" },
    { zhi: "申", label: "申时 (3pm-5pm)" }, { zhi: "酉", label: "酉时 (5pm-7pm)" },
    { zhi: "戌", label: "戌时 (7pm-9pm)" }, { zhi: "亥", label: "亥时 (9pm-11pm)" }
];

function initDropdowns() {
    for (let y = 1910; y <= 2150; y++) UI.gregYear.add(new Option(y + '年', y));
    for (let m = 1; m <= 12; m++) UI.gregMonth.add(new Option(m + '月', m));
    updateDaysDropdown();
    TimePeriods.forEach(tp => UI.gregTime.add(new Option(tp.label, tp.zhi)));
    [UI.gregYear, UI.gregMonth, UI.gregDay, UI.gregTime].forEach(el => {
        el.addEventListener('change', () => {
            if (el === UI.gregYear || el === UI.gregMonth) updateDaysDropdown();
            updateLunarDisplay();
        });
    });
}

function updateDaysDropdown() {
    const y = parseInt(UI.gregYear.value);
    const m = parseInt(UI.gregMonth.value);
    const daysInMonth = new Date(y, m, 0).getDate() || 31;
    const currentDay = parseInt(UI.gregDay.value) || 1;
    UI.gregDay.innerHTML = '';
    for (let d = 1; d <= daysInMonth; d++) UI.gregDay.add(new Option(d + '日', d));
    if (currentDay <= daysInMonth) UI.gregDay.value = currentDay;
}

function updateLunarDisplay() {
    const y = parseInt(UI.gregYear.value);
    const m = parseInt(UI.gregMonth.value);
    const d = parseInt(UI.gregDay.value);
    const hourZhi = UI.gregTime.value;

    try {
        const bazi = BaziUtils.calculatePillars(y, m, d, hourZhi);
        const lunar = LunarTools.solar2lunar(y, m, d);
        
        const dateObj = new Date(y, m - 1, d);
        const dayOfWeek = dateObj.getDay();
        const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        
        let weekdayClass = 'wd-weekday';
        if (dayOfWeek === 0) weekdayClass = 'wd-sun';
        else if (dayOfWeek === 6) weekdayClass = 'wd-sat';
        
        UI.lunarDisplay.innerHTML = `
            <div class="lunar-date-row">${bazi.year.stem}${bazi.year.branch}年 ${lunar.lMonth}月 ${lunar.lDay}日 ${hourZhi}时</div>
            <div class="lunar-weekday-row ${weekdayClass}">${dayNames[dayOfWeek]} ${bazi.isYearTransition ? '<span style="color:red; margin-left:8px;">今日立春</span>' : ''}</div>
        `;
    } catch (e) { 
        UI.lunarDisplay.textContent = '---'; 
    }
}

function resetToToday() {
    const today = new Date();
    UI.gregYear.value = today.getFullYear();
    UI.gregMonth.value = today.getMonth() + 1;
    updateDaysDropdown();
    UI.gregDay.value = today.getDate();
    let zhiIndex = Math.floor((today.getHours() + 1) / 2) % 12;
    UI.gregTime.value = TimePeriods[zhiIndex].zhi;
    UI.userName.value = '未知';
    updateLunarDisplay();
}

function renderGroups() {
    if (!UI.groupList) return;
    UI.groupList.innerHTML = '';
    
    State.groups.forEach(g => {
        const groupRecords = State.records.filter(r => r.groupId === g.id);
        const gWrapper = document.createElement('div');
        gWrapper.className = 'group-wrapper';
        const isCollapsed = State.collapsedGroups.has(g.id);
        const isActive = State.lastUsedGroupId === g.id;
        
        const gHeader = document.createElement('div');
        gHeader.className = `group-header ${isCollapsed ? 'collapsed' : ''}`;
        gHeader.innerHTML = `<span class="group-radio-dot ${isActive?'active':''}"></span> 📂 ${g.name}`;
        
        gHeader.onclick = (e) => {
            if (e.target.classList.contains('group-radio-dot')) {
                State.lastUsedGroupId = g.id;
                saveState(); renderGroups();
                return;
            }
            if (State.collapsedGroups.has(g.id)) State.collapsedGroups.delete(g.id);
            else State.collapsedGroups.add(g.id);
            saveState(); renderGroups();
        };

        gWrapper.appendChild(gHeader);
        handleManagementEvents(gHeader, 'group', g);
        
        if (!isCollapsed) {
            groupRecords.forEach(r => {
                const rDiv = document.createElement('div');
                rDiv.className = `record-item ${State.currentActiveRecord?.id === r.id ? 'active' : ''}`;
                const genderTag = r.gender === 'M' ? '<span class="gender-m">(男)</span>' : '<span class="gender-f">(女)</span>';
                

                rDiv.innerHTML = `
                    <div class="record-info">
                        <div class="name-row">📄 ${r.name} ${genderTag}</div>
                        <div class="date-row">${r.gregYear}/${r.gregMonth}/${r.gregDay} ${r.gregTime}时</div>
                    </div>
                `;
                rDiv.onclick = () => {
                    switchView('view-main');
                    setTimeout(() => renderMainBoard(r), 60);
                };
                handleManagementEvents(rDiv, 'record', r);
                gWrapper.appendChild(rDiv);
            });
        }
        UI.groupList.appendChild(gWrapper);
    });
}

UI.addGroupBtn.onclick = () => {
    const name = prompt("请输入新群组名称:");
    if (name) {
        State.groups.push({ id: 'g_' + Date.now(), name: name });
        saveState();
        renderGroups();
    }
};

// --- Rendering Logic (BaZi Edition) ---
function renderMainBoard(record) {
    if (!record) return;
    State.currentActiveRecord = record;

    let bazi, age;
    try {
        const hourZhi = record.gregTime || "子";
        bazi = BaziUtils.calculatePillars(
            parseInt(record.gregYear), 
            parseInt(record.gregMonth), 
            parseInt(record.gregDay), 
            hourZhi
        );
        age = 2026 - parseInt(record.gregYear) + 1;
    } catch (e) {
        console.error("BaZi calculation error:", e);
        return;
    }

    UI.cName.textContent = record.name;
    
    // Task 018: Merge Gender and Age into one row with character-specific coloring
    const ageRow = document.getElementById('c-age-row');
    if (ageRow) {
        const genderChar = record.gender === 'M' ? '男' : '女';
        const genderClass = record.gender === 'M' ? 'color-male' : 'color-female';
        ageRow.innerHTML = `性别：<span class="${genderClass}">${genderChar}</span> &nbsp;&nbsp; 虚岁：${age}`;
    }

    UI.cGregorian.textContent = `${record.gregYear}-${record.gregMonth}-${record.gregDay} ${record.gregTime}时`;
    
    const lunar = LunarTools.solar2lunar(parseInt(record.gregYear), parseInt(record.gregMonth), parseInt(record.gregDay));
    UI.cLunar.textContent = `${lunar.gzYear} ${lunar.IMonthCn}${lunar.IDayCn}`;

    const renderPillar = (pKey, data, ageLabel, statusClass) => {
        const stemEl = document.getElementById(`p-${pKey}-stem`);
        const branchEl = document.getElementById(`p-${pKey}-branch`);
        const godEl = document.getElementById(`p-${pKey}-god`);
        const hiddenEl = document.getElementById(`p-${pKey}-hidden`);
        const ageEl = document.getElementById(`p-${pKey}-age`);
        const colEl = stemEl?.closest('.pillar-col');

        if (ageEl) {
            ageEl.innerHTML = ageLabel || '';
        }

        if (colEl) {
            colEl.classList.remove('StatusFire', 'StatusWater');
            if (statusClass) colEl.classList.add(statusClass);
        }

        if (stemEl) {
            stemEl.textContent = data.stem;
            stemEl.className = 'p-stem ' + getElementClass(data.stem);
        }
        if (branchEl) {
            branchEl.textContent = data.branch;
            branchEl.className = 'p-branch ' + getElementClass(data.branch);
        }
        if (godEl) {
            if (pKey === 'd') {
                const genderChar = record.gender === 'M' ? '男' : '女';
                godEl.innerHTML = `<span class="dm-badge ${getElementClass(data.stem)}">元${genderChar}</span>`;
                godEl.className = 'p-god';
            } else {
                godEl.textContent = BaziUtils.getTenGod(bazi.day.stem, data.stem);
                godEl.className = 'p-god ' + getElementClass(data.stem);
            }
        }
        if (hiddenEl) {
            const hidden = BaziUtils.getHiddenStems(data.branch);
            const benQi = hidden[0];
            const god = BaziUtils.getTenGod(bazi.day.stem, benQi);
            hiddenEl.innerHTML = `<div class="${getElementClass(benQi)}">${god}</div>`;
        }
    };

    renderPillar('y', bazi.year, '年柱');
    renderPillar('m', bazi.month, '月柱');
    renderPillar('d', bazi.day, '日柱');
    renderPillar('h', bazi.hour, '时柱');

    // --- Calculate & Render Current Luck Pillars ---
    const luckResult = BaziUtils.calculateGreatLuck(
        record.gender, 
        bazi.year.stem, bazi.month.stem, bazi.month.branch,
        parseInt(record.gregYear), parseInt(record.gregMonth), parseInt(record.gregDay)
    );

    // Actual Active Luck (for 2026)
    const currentAge2026 = 2026 - parseInt(record.gregYear) + 1;
    const actualActiveLuckIndex = luckResult.cycles.findIndex(lc => currentAge2026 >= lc.age && currentAge2026 < lc.age + 10);
    
    // Browsing Active Luck
    let luckIndexToUse = State.browsingLuckIndex;
    if (luckIndexToUse === -1) {
        const browsingAge = State.browsingYear - parseInt(record.gregYear) + 1;
        luckIndexToUse = luckResult.cycles.findIndex(lc => browsingAge >= lc.age && browsingAge < lc.age + 10);
    }
    const browsingLuck = luckResult.cycles[luckIndexToUse];

    if (browsingLuck) {
        renderPillar('luck', browsingLuck, `大运 ${browsingLuck.age}岁<br>${browsingLuck.year}`, '');
    }

    const annualResult = BaziUtils.calculateAnnualLuck(bazi.day.stem, State.browsingYear, 1, parseInt(record.gregYear))[0];
    if (annualResult) {
        renderPillar('annual', annualResult, `流年 ${annualResult.age}岁<br>${annualResult.year}`, '');
    }

    const baziCard = document.querySelector('.bazi-card');
    const oldBadge = baziCard.querySelector('.li-chun-badge');
    if (oldBadge) oldBadge.remove();
    if (bazi.isYearTransition) {
        const badge = document.createElement('div');
        badge.className = 'li-chun-badge';
        badge.textContent = '今日立春';
        baziCard.appendChild(badge);
    }

    renderLuckCycles(record, bazi);
    renderAnnualLuck(record, bazi);
    renderMonthlyLuck(record, bazi);
    renderSolarTerms(record, bazi);
    
    // Task: Five Elements Chart


    const scores = BaziUtils.calculateElementScores(bazi);
    renderFiveElementsChart(scores, bazi.day.stem);
}

function renderFiveElementsChart(scores, dayStem) {
    const container = document.getElementById('bazi-elements-chart');
    if (!container) return;
    container.innerHTML = '';

    const selfElement = BaziUtils.ELEMENTS[dayStem];
    const elementsOrder = ['土', '金', '水', '木', '火']; // Generation clockwise loop
    // Re-order to start from Self
    const selfBaseIdx = elementsOrder.indexOf(selfElement);
    const displayOrder = [];
    for(let i=0; i<5; i++) {
        displayOrder.push(elementsOrder[(selfBaseIdx + i) % 5]);
    }

    const elementToGods = {
        '木': ['甲', '乙'], '火': ['丙', '丁'], '土': ['戊', '己'],
        '金': ['庚', '辛'], '水': ['壬', '癸']
    };

    const chartWidth = 175;
    const chartHeight = 150;
    const centerX = chartWidth / 2;
    const centerY = chartHeight / 2;
    const r = 36; // Proportional doughnut radius
    const selfScore = scores[selfElement];
    
    // Logic: Center the Self element at Top (-90 deg)
    let currentAngle = -90 - (selfScore / 2);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", chartWidth);
    svg.setAttribute("height", chartHeight);
    svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
    svg.classList.add("chart-svg");

    const labelsLayer = document.createElement('div');
    labelsLayer.className = 'chart-labels-layer';

    const getPoint = (angle, radius) => {
        const rad = (angle * Math.PI) / 180;
        return {
            x: centerX + radius * Math.cos(rad),
            y: centerY + radius * Math.sin(rad)
        };
    };

    // Background Circle
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", centerX); bg.setAttribute("cy", centerY);
    bg.setAttribute("r", r); bg.classList.add("chart-bg-circle");
    svg.appendChild(bg);

    // Elegant Double-Line Inner Borders
    const lb1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    lb1.setAttribute("cx", centerX); lb1.setAttribute("cy", centerY);
    lb1.setAttribute("r", r - 6); lb1.classList.add("chart-inner-border");
    svg.appendChild(lb1);

    const lb2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    lb2.setAttribute("cx", centerX); lb2.setAttribute("cy", centerY);
    lb2.setAttribute("r", r - 8); lb2.classList.add("chart-inner-border");
    svg.appendChild(lb2);

    // 1. Calculate each slice's ideal center angle
    const slices = [];
    let tempAngle = currentAngle;
    displayOrder.forEach((el, i) => {
        const score = scores[el];
        slices.push({
            el: el,
            targetMid: tempAngle + (score / 2),
            score: score
        });
        tempAngle += score;
    });

    // 2. 2D Centroid Physics Engine (方格重心物理引擎)
    const boxW = 56, boxH = 30; // Virtual bounding box per label
    const boxes = slices.map((s, i) => {
        const rad = (s.targetMid * Math.PI) / 180;
        const initialR = r + 16; // Start very close
        return {
            x: centerX + initialR * Math.cos(rad),
            y: centerY + initialR * Math.sin(rad),
            angle: s.targetMid,
            isSelf: i === 0
        };
    });

    for (let iter = 0; iter < 100; iter++) { // 100 iterations for rock-solid stability
        boxes.forEach((b1, i) => {
            const rad = Math.atan2(b1.y - centerY, b1.x - centerX);
            const cosA = Math.abs(Math.cos(rad));
            const sinA = Math.abs(Math.sin(rad));
            
            // DYNAMIC SAFETY RADIUS (方格对角线防撞)
            const halfBoxRadial = cosA * (boxW / 2) + sinA * (boxH / 2);
            const minAllowed = r + halfBoxRadial + 6; 

            // A. Attraction: Pull toward Cake Center (贴合大圆轨道)
            const dist = Math.sqrt((b1.x - centerX) ** 2 + (b1.y - centerY) ** 2);
            const targetR = minAllowed + 1; 
            const attraction = (dist - targetR) * 0.2;
            const dirX = (b1.x - centerX) / dist;
            const dirY = (b1.y - centerY) / dist;
            b1.x -= dirX * attraction;
            b1.y -= dirY * attraction;

            // B. Spring: Pull toward ideal angle
            let aDiff = rad - (b1.angle * Math.PI) / 180;
            while (aDiff > Math.PI) aDiff -= Math.PI * 2;
            while (aDiff < -Math.PI) aDiff += Math.PI * 2;
            const sForce = 0.12; // Increased for tighter alignment
            const currentDist = Math.sqrt((b1.x - centerX) ** 2 + (b1.y - centerY) ** 2);
            const newAngle = rad - aDiff * sForce;
            b1.x = centerX + currentDist * Math.cos(newAngle);
            b1.y = centerY + currentDist * Math.sin(newAngle);

            // C. Collision: Push apart from other boxes
            for (let j = i + 1; j < boxes.length; j++) {
                const b2 = boxes[j];
                const dx = b1.x - b2.x;
                const dy = b1.y - b2.y;
                const minDX = boxW + 4; 
                const minDY = boxH + 2;
                if (Math.abs(dx) < minDX && Math.abs(dy) < minDY) {
                    const ox = minDX - Math.abs(dx);
                    const oy = minDY - Math.abs(dy);
                    if (ox < oy) {
                        const push = (dx > 0 ? 1 : -1) * ox * 0.5;
                        b1.x += push; b2.x -= push;
                    } else {
                        const push = (dy > 0 ? 1 : -1) * oy * 0.5;
                        b1.y += push; b2.y -= push;
                    }
                }
            }

            // D. Cake Constraint: HARD Inner Barrier
            const dInner = Math.sqrt((b1.x - centerX) ** 2 + (b1.y - centerY) ** 2);
            if (dInner < minAllowed) {
                const ratio = minAllowed / dInner;
                b1.x = centerX + (b1.x - centerX) * ratio;
                b1.y = centerY + (b1.y - centerY) * ratio;
            }

            // E. Containment Walls (防出界“硬围墙”)
            // Card boundaries (175x150 relative to chart area)
            // Top Wall: prevent clipping at the card header
            if (b1.y < 18) b1.y = 18; 
            // Right Wall: prevent clipping at phone edge
            if (b1.x > 168) b1.x = 168;
            // Bottom Wall
            if (b1.y > 135) b1.y = 135;

            // F. Anchor Self strictly to the Top
            if (b1.isSelf) {
                b1.x = centerX + (b1.x - centerX) * 0.05; 
                if (b1.y > centerY - minAllowed) b1.y = centerY - minAllowed;
            }
        });
    }

    // 3. Render slices and place labels
    let tempSumAngle = currentAngle;
    displayOrder.forEach((el, i) => {
        const score = scores[el];
        const box = boxes[i];
        const start = getPoint(tempSumAngle, r);
        const end = getPoint(tempSumAngle + score, r);
        const d = `M ${start.x} ${start.y} A ${r} ${r} 0 ${score <= 180 ? 0 : 1} 1 ${end.x} ${end.y}`;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.classList.add("chart-inner-ring", "stroke-" + getElementClassFromText(el));
        svg.appendChild(path);
        tempSumAngle += score;

        const labelDiv = document.createElement('div');
        labelDiv.className = `element-label el-${getElementClassFromText(el)}`;
        labelDiv.style.left = `${box.x - (boxW / 2)}px`;
        labelDiv.style.top = `${box.y - (boxH / 2)}px`;
        labelDiv.style.width = `${boxW}px`;

        const relX = box.x - centerX;
        const relY = box.y - centerY;
        let textAlign = (Math.abs(relX) < 15 && relY < 0) ? 'center' : (relX >= 0 ? 'left' : 'right');

        // FIXED TEN GOD ORDER LOGIC (强制统一行规)
        const stems = elementToGods[el];
        let g1 = BaziUtils.getTenGod(dayStem, stems[0]);
        let g2 = BaziUtils.getTenGod(dayStem, stems[1]);
        const ROW1_TYPES = ['劫财', '伤官', '正财', '正官', '正印'];
        if (ROW1_TYPES.includes(g2) && !ROW1_TYPES.includes(g1)) {
            [g1, g2] = [g2, g1];
        }

        labelDiv.innerHTML = `
            <div class="text-group" style="text-align: ${textAlign}">
                <div class="god-row">
                    <span class="god-name">${g1}</span>
                    <div class="chart-color-box bg-${getElementClassFromText(el)}"></div>
                </div>
                <div class="god-row">
                    <span class="god-name">${g2}</span>
                    <span class="score-text">${score}</span>
                </div>
            </div>
        `;
        labelsLayer.appendChild(labelDiv);
    });

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", centerX); text.setAttribute("y", centerY);
    text.classList.add("chart-center-text", "fill-" + getElementClassFromText(selfElement));
    text.textContent = dayStem + selfElement;
    svg.appendChild(text);

    container.appendChild(svg); container.appendChild(labelsLayer);
}

function getElementClassFromText(el) {
    if (el === '木') return 'wood';
    if (el === '火') return 'fire';
    if (el === '土') return 'earth';
    if (el === '金') return 'metal';
    if (el === '水') return 'water';
    return '';
}

function getElementClass(char) {
    const el = BaziUtils.ELEMENTS[char];
    if (el === '木') return 'wood';
    if (el === '火') return 'fire';
    if (el === '土') return 'earth';
    if (el === '金') return 'metal';
    if (el === '水') return 'water';
    return '';
}

function renderLuckCycles(record, bazi) {
    const luckList = document.getElementById('luck-list');
    if (!luckList) return;
    luckList.innerHTML = '';
    
    const luckResult = BaziUtils.calculateGreatLuck(
        record.gender, 
        bazi.year.stem, bazi.month.stem, bazi.month.branch,
        parseInt(record.gregYear), parseInt(record.gregMonth), parseInt(record.gregDay)
    );
    
    const actualCurrentYear = 2026;
    const currentAge2026 = actualCurrentYear - parseInt(record.gregYear) + 1;
    const actualActiveLuckIndex = luckResult.cycles.findIndex(lc => currentAge2026 >= lc.age && currentAge2026 < lc.age + 10);

    // Browsing focus
    let luckIndexToUse = State.browsingLuckIndex;
    if (luckIndexToUse === -1) {
        const browsingAge = State.browsingYear - parseInt(record.gregYear) + 1;
        luckIndexToUse = luckResult.cycles.findIndex(lc => browsingAge >= lc.age && browsingAge < lc.age + 10);
    }

    luckResult.cycles.forEach((luck, idx) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'luck-item-wrapper';
        
        const isActualCurrent = idx === actualActiveLuckIndex;
        const isBrowsingFocus = idx === luckIndexToUse;
        const isBrowsingMode = !isActualCurrent || State.browsingLuckIndex !== -1;

        let highlightClass = '';
        if (isBrowsingFocus) {
            highlightClass = isActualCurrent ? 'active-fire' : 'active-water';
        }
        // If it isActualCurrent but NOT isBrowsingFocus, it stays empty (disappears as requested)

        itemWrapper.innerHTML = `
            <div class="luck-info-age">${luck.age}岁</div>
            <div class="luck-info-year">${luck.year}</div>
            <div class="luck-box ${highlightClass}">
                <div class="luck-god-mini ${getElementClass(luck.stem)}">${luck.stemGod}</div>
                <div class="luck-char-main ${getElementClass(luck.stem)}">${luck.stem}</div>
                <div class="luck-char-main ${getElementClass(luck.branch)}">${luck.branch}</div>
                <div class="luck-god-mini ${getElementClass(luck.branch)}">${luck.branchGod}</div>
            </div>
        `;
        
        itemWrapper.onclick = () => {
            State.browsingYear = luck.year;
            State.browsingLuckIndex = idx;
            renderMainBoard(record);
        };

        luckList.appendChild(itemWrapper);
    });
}

function renderAnnualLuck(record, bazi) {
    const annualList = document.getElementById('annual-list');
    if (!annualList) return;
    annualList.innerHTML = '';
    
    // Determine the start year based on the selected Great Luck
    const luckResult = BaziUtils.calculateGreatLuck(
        record.gender, 
        bazi.year.stem, bazi.month.stem, bazi.month.branch,
        parseInt(record.gregYear), parseInt(record.gregMonth), parseInt(record.gregDay)
    );
    
    let luckIndexToUse = State.browsingLuckIndex;
    if (luckIndexToUse === -1) {
        const browsingAge = State.browsingYear - parseInt(record.gregYear) + 1;
        luckIndexToUse = luckResult.cycles.findIndex(lc => browsingAge >= lc.age && browsingAge < lc.age + 10);
    }
    const startYear = luckResult.cycles[luckIndexToUse]?.year || 2026;

    const annualResults = BaziUtils.calculateAnnualLuck(
        bazi.day.stem, 
        startYear, 
        10, 
        parseInt(record.gregYear)
    );
    
    annualResults.forEach((yearLuck) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'luck-item-wrapper';
        
        const isActualCurrentYear = yearLuck.year === 2026;
        const isBrowsingYear = yearLuck.year === State.browsingYear;
        
        let highlightClass = '';
        if (isBrowsingYear) {
            highlightClass = isActualCurrentYear ? 'active-fire' : 'active-water';
        }
        // If isActualCurrentYear but NOT isBrowsingYear, it stays empty

        itemWrapper.innerHTML = `
            <div class="luck-info-year">${yearLuck.year}</div>
            <div class="luck-box ${highlightClass}">
                <div class="luck-god-mini ${getElementClass(yearLuck.stem)}">${yearLuck.stemGod}</div>
                <div class="luck-char-main ${getElementClass(yearLuck.stem)}">${yearLuck.stem}</div>
                <div class="luck-char-main ${getElementClass(yearLuck.branch)}">${yearLuck.branch}</div>
                <div class="luck-god-mini ${getElementClass(yearLuck.branch)}">${yearLuck.branchGod}</div>
            </div>
        `;
        
        itemWrapper.onclick = () => {
            State.browsingYear = yearLuck.year;
            // BrowsingLuckIndex remains the same as we are in the same 10-year cycle
            renderMainBoard(record);
        };

        annualList.appendChild(itemWrapper);
    });
}

function renderMonthlyLuck(record, bazi) {
    const monthlyList = document.getElementById('monthly-list');
    if (!monthlyList) return;
    monthlyList.innerHTML = '';

    // Calculate current real-time BaZi month for comparison
    const now = new Date();
    const currentPillars = BaziUtils.calculatePillars(now.getFullYear(), now.getMonth() + 1, now.getDate(), "子");
    const currentMonthGz = currentPillars.month.stem + currentPillars.month.branch;
    const isCurrentYear = State.browsingYear === now.getFullYear();

    // Calculate month pillars for the currently browsed year
    const yearGz = BaziUtils.getYearGanZhi(State.browsingYear);
    const months = BaziUtils.calculateMonthlyLuck(bazi.day.stem, yearGz.stem);

    months.forEach((m) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'luck-item-wrapper';
        
        const isNowMonth = isCurrentYear && (m.stem + m.branch === currentMonthGz);
        const isBrowsingMonth = (m.index === State.browsingMonthIndex);
        
        let highlightClass = '';
        if (isBrowsingMonth) {
            highlightClass = 'active-water';
        } else if (isNowMonth && State.browsingMonthIndex === -1) {
            highlightClass = 'active-fire';
        }

        let monthNameStr = m.index <= 10 ? ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][m.index - 1] + '月' : m.index + '月';

        itemWrapper.innerHTML = `
            <div class="luck-info-age">${monthNameStr}</div>
            <div class="luck-box ${highlightClass}">
                <div class="luck-god-mini ${getElementClass(m.stem)}">${m.stemGod}</div>
                <div class="luck-char-main ${getElementClass(m.stem)}">${m.stem}</div>
                <div class="luck-char-main ${getElementClass(m.branch)}">${m.branch}</div>
                <div class="luck-god-mini ${getElementClass(m.branch)}">${m.branchGod}</div>
            </div>
        `;
        
        itemWrapper.onclick = () => {
            State.browsingMonthIndex = m.index;
            renderMainBoard(record);
        };

        monthlyList.appendChild(itemWrapper);
    });
}

function renderSolarTerms(record, bazi) {
    const solarList = document.getElementById('solar-list');
    if (!solarList) return;
    solarList.innerHTML = '';

    const now = new Date();
    const isBrowsingCurrentYear = State.browsingYear === now.getFullYear();

    // Detect the current real-time solar term index (0-23)
    let currentTermIdx = -1;
    if (isBrowsingCurrentYear || State.browsingYear === now.getFullYear() - 1) {
        // We check the terms of the currently ACTIVE BaZi year
        const baZiYear = State.browsingYear; 
        for (let i = 23; i >= 0; i--) {
            let ty = baZiYear;
            if (i >= 22) ty += 1; // High index terms are in Jan of NEXT year
            const d = BaziUtils.getSolarTermDay(ty, i);
            const m = BaziUtils.getSolarTermMonth(i);
            const termDate = new Date(ty, m - 1, d);
            if (now >= termDate) {
                // If we are browsing the year that contains 'now'
                if (baZiYear === now.getFullYear() || (baZiYear === now.getFullYear() - 1 && i >= 22)) {
                   currentTermIdx = i;
                   break;
                }
            }
        }
    }

    for (let c = 0; c < 12; c++) {
        const pairDiv = document.createElement('div');
        pairDiv.className = 'solar-pair';
        
        for (let j = 0; j < 2; j++) {
            const i = c * 2 + j;
            const name = BaziUtils.SOLAR_TERMS[i];
            
            const item = document.createElement('div');
            item.className = 'solar-item';
            
            let seasonClass = '';
            if (i < 6) seasonClass = 'color-spring';
            else if (i < 12) seasonClass = 'color-summer';
            else if (i < 18) seasonClass = 'color-autumn';
            else seasonClass = 'color-winter';

            // BaZi year starting in 'browsingYear' (Feb) ends in 'browsingYear + 1' (Jan)
            let targetYear = State.browsingYear;
            if (i >= 22) targetYear += 1;

            const day = BaziUtils.getSolarTermDay(targetYear, i);
            const month = BaziUtils.getSolarTermMonth(i);
            
            const isActive = isBrowsingCurrentYear && i === currentTermIdx;
            const activeClass = isActive ? 'active-solar-fire' : '';

            const monthAbbrs = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const displayMonth = month > 12 ? month - 12 : month;
            const monthAbbr = monthAbbrs[displayMonth - 1];

            item.innerHTML = `
                <div class="solar-name-box ${seasonClass} ${activeClass}">${name}</div>
                <div class="solar-date"><span class="solar-day">${day}</span><span class="solar-mon">${monthAbbr}</span></div>

            `;


            pairDiv.appendChild(item);
        }
        solarList.appendChild(pairDiv);
    }
}



// --- Global System Funcs ---
function init() {
    initDropdowns();
    resetToToday();
    renderGroups();
    checkAuth();
    initBackgroundSystem();

    UI.navItems.forEach(item => {
        item.addEventListener('click', function() {
            this.blur(); // Force clear focus to prevent stuck hover/active states
            if (item.dataset.view) switchView(item.dataset.view);
        });
    });

    UI.btnSaveChart.onclick = () => {
        const record = {
            id: 'r_' + Date.now(),
            name: UI.userName.value || '未知',
            gregYear: UI.gregYear.value,
            gregMonth: UI.gregMonth.value,
            gregDay: UI.gregDay.value,
            gregTime: UI.gregTime.value,
            gender: document.querySelector('input[name="gender"]:checked').value,
            groupId: State.lastUsedGroupId || 'default'
        };
        State.records.push(record);
        saveState(); renderGroups();
        switchView('view-main');
        renderMainBoard(record);
    };

    UI.btnNewChart.onclick = () => resetToToday();

    UI.btnLogoutSystem.onclick = () => {
        if (confirm("确定要退出系统吗？")) {
            State.isLoggedIn = false;
            localStorage.removeItem('ziwi_auth');
            checkAuth();
        }
    };

    UI.snapshotBtn.onclick = () => {
        const record = State.currentActiveRecord;
        if (!record) return;

        const now = new Date();
        const fmt = (d) => d.toString().padStart(2, '0');
        const nowStr = `${now.getFullYear()}${fmt(now.getMonth() + 1)}${fmt(now.getDate())} ${fmt(now.getHours())}${fmt(now.getMinutes())}`;
        
        const genderChar = record.gender === 'M' ? '男' : '女';
        const birthDateStr = `${record.gregYear}${fmt(record.gregMonth)}${fmt(record.gregDay)}`;
        const birthTime = record.gregTime.includes('时') ? record.gregTime : record.gregTime + '时';
        
        const fileName = `${nowStr} ${record.name}${genderChar}${birthDateStr}${birthTime}.jpg`;

        const target = UI.mainBoard;
        target.classList.add('capturing');
        
        // Ensure accurate full-height capture by resetting scroll position context for canvas
        html2canvas(target, { 
            useCORS: true, 
            scale: 3, // Higher scale for premium quality
            backgroundColor: "#f0f2f5",
            scrollY: -window.scrollY,
            scrollX: -window.scrollX,
            windowWidth: target.scrollWidth,
            windowHeight: target.scrollHeight
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = fileName;
            link.href = canvas.toDataURL("image/jpeg", 0.95);
            link.click();
            target.classList.remove('capturing');
        });

    };

    UI.refreshBtn.onclick = () => {
        State.browsingYear = 2026;
        State.browsingLuckIndex = -1;
        State.browsingMonthIndex = -1;
        if (State.currentActiveRecord) {
            renderMainBoard(State.currentActiveRecord);
        }
    };


    // Import Buttons
    UI.importBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI.importFileInput.click();
    };

    UI.importFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            handleImport(event.target.result);
            e.target.value = ''; // Reset for next time
        };
        reader.readAsText(file);
    };

    // Context Menu Buttons
    UI.menuRename.onclick = (e) => { 
        e.stopPropagation(); 
        handleRename(); 
    };
    UI.menuDelete.onclick = (e) => { 
        e.stopPropagation(); 
        handleDelete(); 
    };

    // Backup Button
    UI.backupBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.blur();
        handleBackup();
    };
}

function handleImport(content) {
    if (!content) return;

    const lines = content.split(/\r?\n/);
    let currentGroupId = 'default';
    let importCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Group Detection (Supports "群组: " or "群组名称 ")
        if (line.startsWith("群组: ") || line.startsWith("群组名称")) {
            const groupName = line.replace(/^(群组: |群组名称\s*)/, "").trim();
            // Check if group exists
            let group = State.groups.find(g => g.name === groupName);
            if (!group) {
                group = { id: 'g_' + Date.now() + Math.random().toString(36).substr(2, 5), name: groupName };
                State.groups.push(group);
            }
            currentGroupId = group.id;
            continue;
        }

        // Record Detection (Look for Name followed by Gender)
        if (i + 2 < lines.length) {
            const nextLine = lines[i + 1].trim();
            const dateLine = lines[i + 2].trim();

            if ((nextLine === "男" || nextLine === "女") && dateLine.includes("年")) {
                const name = line;
                const gender = nextLine === "男" ? "M" : "F";
                
                // Flexible regex for date: handles "1981年5月21日" and "1981年 5月 21日"
                // Match Year, Month, Day and then capture the Time Zhi (first character of the rest)
                const dateMatch = dateLine.match(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日\s*(.*)/);
                if (dateMatch) {
                    const year = dateMatch[1];
                    const month = dateMatch[2];
                    const day = dateMatch[3];
                    let timeRaw = dateMatch[4].trim();
                    
                    // Extract the Time Zhi (e.g., from "寅时 8pm")
                    const timeZhiMatch = timeRaw.match(/[子丑寅卯辰巳午未申酉戌亥]/);
                    const timeZhi = timeZhiMatch ? timeZhiMatch[0] : "子";

                    const record = {
                        id: 'r_' + Date.now() + Math.random().toString(36).substr(2, 5),
                        name: name,
                        gender: gender,
                        gregYear: year,
                        gregMonth: month,
                        gregDay: day,
                        gregTime: timeZhi,
                        groupId: currentGroupId
                    };

                    // Avoid perfect duplicates in same group
                    const exists = State.records.find(r => 
                        r.name === record.name && 
                        r.gregYear === record.gregYear && 
                        r.gregMonth === record.gregMonth && 
                        r.gregDay === record.gregDay && 
                        r.gregTime === record.gregTime &&
                        r.groupId === record.groupId
                    );

                    if (!exists) {
                        State.records.push(record);
                        importCount++;
                    }
                    i += 2; // Skip next two processed lines
                }
            }
        }
    }

    saveState();
    renderGroups();
    alert(`成功导入 ${importCount} 条数据。`);
}

function handleBackup() {
    const CRLF = "\r\n";
    
    // Filter out records that don't belong to any active group
    const validGroupIds = new Set(State.groups.map(g => g.id));
    const validRecords = State.records.filter(r => validGroupIds.has(r.groupId));

    if (validRecords.length === 0) {
        alert("没有命盘数据可备份。");
        return;
    }

    let content = "【 地天髓八字 - 数据备份 】" + CRLF;
    content += "导出时间: " + new Date().toLocaleString() + CRLF;
    content += "------------------------------------------" + CRLF + CRLF;

    // Group valid records
    const grouped = {};
    validRecords.forEach(r => {
        if (!grouped[r.groupId]) grouped[r.groupId] = [];
        grouped[r.groupId].push(r);
    });

    // Iterate through groups
    State.groups.forEach(group => {
        const recs = grouped[group.id] || [];
        if (recs.length === 0) return;

        content += `群组: ${group.name}` + CRLF + CRLF;

        recs.forEach(r => {
            const genderText = r.gender === 'M' ? '男' : '女';
            // gregTime already stores strings like '子', '丑' etc. in this app
            const branchName = (r.gregTime || "未知");
            const timeStr = branchName.includes("时") ? branchName : (branchName + "时");

            content += `${r.name}${CRLF}`;
            content += `${genderText}${CRLF}`;
            content += `${r.gregYear}年 ${r.gregMonth}月 ${r.gregDay}日 ${timeStr}${CRLF}${CRLF}`;
        });

        content += "------------------------------------------" + CRLF + CRLF;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BaZi_Backup_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

window.onclick = (e) => {
    // Only hide if we're not clicking inside the menu itself
    if (UI.contextMenu && !UI.contextMenu.contains(e.target)) {
        hideContextMenu();
    }
};

function initBackgroundSystem() {
    const applyBg = (src) => {
        if (!src) UI.bgLayer.style.backgroundImage = 'none';
        else UI.bgLayer.style.backgroundImage = `url("${src}")`;
    };
    const savedBg = localStorage.getItem('ziwi_bg_image');
    if (savedBg) applyBg(savedBg);

    // FIXED: Use a cleaner event binding to prevent "hyperactive" background picker
    UI.bgChangeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI.bgUploadInput.click();
    };

    UI.bgUploadInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            localStorage.setItem('ziwi_bg_image', dataUrl);
            applyBg(dataUrl);
        };
        reader.readAsDataURL(file);
    };
}

init();

