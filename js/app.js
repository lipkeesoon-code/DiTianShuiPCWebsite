// app.js - Di Tian Shui BaZi Edition

const State = {
    groups: JSON.parse(localStorage.getItem('ziwi_groups')) || [{ id: 'default', name: '默认群组' }],
    records: JSON.parse(localStorage.getItem('ziwi_records')) || [],
    defaultGroupId: localStorage.getItem('ziwi_default_group') || '',
    currentActiveRecord: null,
    isLoggedIn: sessionStorage.getItem('ziwi_auth_passed') === 'true',
    isFirstStagePassed: sessionStorage.getItem('ziwi_first_stage') === 'true',
    lastUsedGroupId: localStorage.getItem('ziwi_last_used_group') || '',
    collapsedGroups: new Set(JSON.parse(localStorage.getItem('ziwi_collapsed_groups')) || []),
    browsingYear: 2026,
    browsingLuckIndex: -1,  // -1 means auto-calculate from browsingYear
    browsingMonthIndex: -1 // -1 means auto-calculate (default to current month)
};


const UI = {
    phoneContainer: document.getElementById('phone-container'),
    dashboardContainer: document.getElementById('dashboard-container'),
    bottomNav: document.getElementById('bottom-nav'),
    views: document.querySelectorAll('.app-view'),
    navItems: document.querySelectorAll('.nav-item'),
    navIconBtns: document.querySelectorAll('.nav-icon-btn'),

    // Login
    loginEmail: document.getElementById('login-email'),
    loginPass: document.getElementById('login-pass'),
    btnLogin: document.getElementById('btn-login'),
    loginError: document.getElementById('login-error'),

    // Security Questions
    secQ1: document.getElementById('sec-q1'),
    secQ2: document.getElementById('sec-q2'),
    secQ3: document.getElementById('sec-q3'),
    secQ4: document.getElementById('sec-q4'),
    secQ5: document.getElementById('sec-q5'),
    btnSecSubmit: document.getElementById('btn-sec-submit'),
    secError: document.getElementById('sec-error'),

    // Input (PC Focused)
    gregYear: document.getElementById('greg-year-pc'),
    gregMonth: document.getElementById('greg-month-pc'),
    gregDay: document.getElementById('greg-day-pc'),
    gregTime: document.getElementById('greg-time-pc'),
    lunarDisplay: document.getElementById('lunar-display-pc'),
    userName: document.getElementById('user-name-pc'),
    btnSaveChart: document.getElementById('btn-save-chart-pc'),
    btnNewChart: document.getElementById('btn-new-chart-pc'),

    // Records (PC Focused)
    groupList: document.getElementById('group-list-pc'),
    addGroupBtn: document.getElementById('add-group-btn-pc'),
    importBtn: document.getElementById('import-btn-pc'),
    importFileInput: document.getElementById('import-file-input'), // Shared or hidden

    // Context Menu
    contextMenu: document.getElementById('context-menu'),
    menuRename: document.getElementById('menu-rename'),
    menuDelete: document.getElementById('menu-delete'),

    // Main Board (PC Focused)
    mainBoard: document.getElementById('chart-area-pc'),
    cName: document.getElementById('c-name-pc'),
    cGregorian: document.getElementById('c-gregorian-pc'),
    cLunar: document.getElementById('c-lunar-pc'),
    cGender: document.getElementById('c-gender-pc'),

    // Global Funcs (PC Focused)
    snapshotBtn: document.getElementById('snapshot-btn-pc'),
    backupBtn: document.getElementById('backup-btn-pc'),
    refreshBtn: document.getElementById('refresh-btn-pc'),
    bgChangeBtn: document.getElementById('bg-change-btn-pc'),
    bgUploadInput: document.getElementById('bg-upload-input'),
    bgLayer: document.getElementById('bg-layer'),
    dashboardBgOverlay: document.getElementById('dashboard-bg-overlay'),
    btnLogoutSystem: document.getElementById('logout-btn-pc')
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
    // Hide mobile views and show PC dashboard if authenticated
    if (viewId === 'dashboard-container') {
        UI.dashboardContainer.classList.add('dashboard-active');
        UI.views.forEach(v => v.classList.remove('active'));
        UI.phoneContainer.classList.add('dashboard-view-active');
        document.body.classList.add('pc-mode');
    } else {
        UI.views.forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');

        // If it's the login or security view, ensure dashboard is hidden
        if (viewId === 'view-login' || viewId === 'view-security') {
            UI.dashboardContainer.classList.remove('dashboard-active');
        }
    }

    // Handle nav items
    UI.navItems.forEach(item => item.classList.remove('active'));
    UI.navIconBtns.forEach(btn => btn.classList.remove('active'));

    const targetNav = Array.from(UI.navItems).find(i => i.dataset.view === viewId);
    if (targetNav) targetNav.classList.add('active');

    const targetIconBtn = Array.from(UI.navIconBtns).find(i => i.dataset.view === viewId);
    if (targetIconBtn) targetIconBtn.classList.add('active');
}

// --- Auth System ---
const ADMIN_EMAIL = "lipkeesoon@hotmail.com";
const ADMIN_PASS = "matahari521413";

const SecurityAnswers = {
    q1: "富士山下",
    q2: "拉丁花园",
    q3: "七杀武曲",
    q4: "马大医院",
    q5: "宝石戏院"
};

function checkAuth() {
    if (State.isLoggedIn) {
        UI.bottomNav.style.display = 'none'; // Replaced by sidebar on PC
        switchView('dashboard-container');
        setTimeout(() => {
            renderGroups();
            resetToToday();
        }, 100);
    } else if (State.isFirstStagePassed) {
        UI.bottomNav.style.display = 'none';
        switchView('view-security');
    } else {
        UI.bottomNav.style.display = 'none';
        switchView('view-login');
    }
}

UI.btnLogin.onclick = () => {
    const email = UI.loginEmail.value.trim().toLowerCase();
    const pass = UI.loginPass.value.trim();
    if (email === ADMIN_EMAIL.toLowerCase() && pass === ADMIN_PASS) {
        State.isFirstStagePassed = true;
        sessionStorage.setItem('ziwi_first_stage', 'true');
        checkAuth();
    } else {
        UI.loginError.textContent = "账户或密码错误，请检查输入。";
    }
};

UI.btnSecSubmit.onclick = () => {
    const a1 = UI.secQ1.value.trim();
    const a2 = UI.secQ2.value.trim();
    const a3 = UI.secQ3.value.trim();
    const a4 = UI.secQ4.value.trim();
    const a5 = UI.secQ5.value.trim();

    if (a1 === SecurityAnswers.q1 && 
        a2 === SecurityAnswers.q2 && 
        a3 === SecurityAnswers.q3 && 
        a4 === SecurityAnswers.q4 && 
        a5 === SecurityAnswers.q5) {
        
        State.isLoggedIn = true;
        sessionStorage.setItem('ziwi_auth_passed', 'true');
        checkAuth();
    } else {
        UI.secError.textContent = "安全问题答案不正确，请重新输入。";
    }
};

UI.btnLogoutSystem.onclick = () => {
    if (confirm("确定要退出系统吗？")) {
        State.isLoggedIn = false;
        State.isFirstStagePassed = false;
        sessionStorage.removeItem('ziwi_auth_passed');
        sessionStorage.removeItem('ziwi_first_stage');
        checkAuth();
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
    { zhi: "子", label: "子时11pm-1am" }, { zhi: "丑", label: "丑时1am-3am" },
    { zhi: "寅", label: "寅时3am-5am" }, { zhi: "卯", label: "卯时5am-7am" },
    { zhi: "辰", label: "辰时7am-9am" }, { zhi: "巳", label: "巳时9am-11am" },
    { zhi: "午", label: "午时11am-1pm" }, { zhi: "未", label: "未时1pm-3pm" },
    { zhi: "申", label: "申时3pm-5pm" }, { zhi: "酉", label: "酉时5pm-7pm" },
    { zhi: "戌", label: "戌时7pm-9pm" }, { zhi: "亥", label: "亥时9pm-11pm" }
];

function initDropdowns() {
    for (let y = 1910; y <= 2150; y++) UI.gregYear.add(new Option(y + '年', y));
    for (let m = 1; m <= 12; m++) UI.gregMonth.add(new Option(m + '月', m));
    updateDaysDropdown();
    // Use the descriptive labels for time slots as seen in screenshot
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

        // Compact single-line format as per screenshot
        // e.g. "丙午年 三月 初六 未时 星期三"
        const lunarDetail = `${bazi.year.stem}${bazi.year.branch}年 ${lunar.IMonthCn} ${lunar.IDayCn} ${hourZhi}时 ${dayNames[dayOfWeek]}`;

        UI.lunarDisplay.innerHTML = `
            <div class="lunar-info-line">
                ${lunarDetail}
                ${bazi.isYearTransition ? '<span style="color:red; font-weight:bold; margin-left:10px;">(立春)</span>' : ''}
            </div>
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
        gHeader.innerHTML = `<span class="group-radio-dot ${isActive ? 'active' : ''}"></span> 📂 ${g.name}`;

        // Single click only for the radio dot
        gHeader.onclick = (e) => {
            if (e.target.classList.contains('group-radio-dot')) {
                State.lastUsedGroupId = g.id;
                saveState(); renderGroups();
                return;
            }
        };

        // Double click for collapse/expand
        gHeader.ondblclick = (e) => {
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

                const genderClass = r.gender === 'M' ? 'gender-m' : 'gender-f';
                const genderChar = r.gender === 'M' ? '男' : '女';

                rDiv.innerHTML = `
                    <div class="record-info">
                        <div class="name-row">📄 ${r.name} <span class="${genderClass}">(${genderChar})</span></div>
                        <div class="date-row">${r.gregYear}年${r.gregMonth}月${r.gregDay}日 ${r.gregTime}时</div>
                    </div>
                `;
                rDiv.onclick = () => {
                    switchView('dashboard-container');
                    renderMainBoard(r);
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

    if (UI.cName) {
        UI.cName.textContent = record.name || '未知';
        UI.cName.style.setProperty('font-size', '2.4rem', 'important'); // Reset
        
        // Auto-shrink font size if it exceeds 2 lines
        // For 2.4rem with 1.2 line-height, 2 lines is about 92px.
        // We check if it's > 95px to trigger shrink.
        setTimeout(() => {
            let fontSize = 2.4;
            while (UI.cName.offsetHeight > 95 && fontSize > 1.2) {
                fontSize -= 0.1;
                UI.cName.style.setProperty('font-size', fontSize + 'rem', 'important');
            }
        }, 100); 
    }

    const genderChar = record.gender === 'M' ? '男' : '女';
    const hourZhi = record.gregTime || "子";
    const lunar = LunarTools.solar2lunar(parseInt(record.gregYear), parseInt(record.gregMonth), parseInt(record.gregDay));

    if (UI.cGregorian) UI.cGregorian.textContent = `西历: ${record.gregYear} 年${record.gregMonth}月${record.gregDay}日 ${hourZhi}时`;
    if (UI.cLunar) UI.cLunar.textContent = `农历: ${bazi.year.stem}${bazi.year.branch}年 ${lunar.IMonthCn}${lunar.IDayCn}`;
    if (UI.cGender) {
        const genderClass = record.gender === 'M' ? 'gender-m' : 'gender-f';
        UI.cGender.innerHTML = `性别: <span class="${genderClass}">${genderChar}</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;虚岁: ${age}`;
    }

    const renderPillar = (pKey, data, ageLabel, statusClass) => {
        const stemEl = document.getElementById(`p-${pKey}-stem-pc`);
        const branchEl = document.getElementById(`p-${pKey}-branch-pc`);
        const godEl = document.getElementById(`p-${pKey}-god-pc`);
        const hiddenEl = document.getElementById(`p-${pKey}-hidden-pc`);
        const ageEl = document.getElementById(`p-${pKey}-age-pc`);
        const colEl = document.getElementById(`p-${pKey}-col-pc`);

        if (ageEl) {
            ageEl.innerHTML = ageLabel || '';
            // Task: Handle age-based font size for luck pillars (Tier 1, last 2 pillars)
            if (pKey === 'luck' || pKey === 'annual') {
                const ageVal = data ? data.age : 0;
                if (ageVal > 99) {
                    ageEl.style.setProperty('font-size', '12px', 'important');
                } else {
                    ageEl.style.setProperty('font-size', '13.6px', 'important');
                }
            }
        }

        if (colEl) {
            // Uniform grey design (except Day Master) - no longer adding element-based borders
            if (statusClass) colEl.classList.add(statusClass);
        }

        if (stemEl) {
            stemEl.textContent = data.stem;
            stemEl.className = 'pillar-stem text-' + getElementClass(data.stem);
        }
        if (branchEl) {
            branchEl.textContent = data.branch;
            branchEl.className = 'pillar-branch ' + getElementClass(data.branch);
        }
        if (godEl) {
            if (pKey === 'd') {
                const genderChar = record.gender === 'M' ? '男' : '女';
                godEl.innerHTML = `元${genderChar}`;
                godEl.className = 'pillar-god pillar-god-yuan bg-' + getElementClass(data.stem);
            } else {
                godEl.textContent = BaziUtils.getTenGod(bazi.day.stem, data.stem);
                godEl.className = 'pillar-god ' + getElementClass(data.stem);
            }
        }
        if (hiddenEl) {
            const hidden = BaziUtils.getHiddenStems(data.branch);
            const benQi = hidden[0];
            const god = BaziUtils.getTenGod(bazi.day.stem, benQi);
            hiddenEl.innerHTML = god;
            hiddenEl.className = 'pillar-hidden ' + getElementClass(benQi);
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

    const baziCard = document.querySelector('.bazi-card-pc');
    if (baziCard) {
        const oldBadge = baziCard.querySelector('.li-chun-badge');
        if (oldBadge) oldBadge.remove();
        if (bazi.isYearTransition) {
            const badge = document.createElement('div');
            badge.className = 'li-chun-badge';
            badge.textContent = '今日立春';
            baziCard.appendChild(badge);
        }
    }

    renderLuckCycles(record, bazi);
    renderAnnualLuck(record, bazi);
    renderMonthlyLuck(record, bazi);
    renderSolarTerms(record, bazi);

    const scores = BaziUtils.calculateElementScores(bazi);
    renderFiveElementsChart(scores, bazi.day.stem);
    renderBarChart(scores, bazi.day.stem);
}

function renderBarChart(scores, dayStem) {
    const container = document.getElementById('bazi-bars-chart-pc');
    if (!container) return;
    container.innerHTML = '';

    const selfEl = BaziUtils.ELEMENTS[dayStem];
    const elementsOrder = ['木', '火', '土', '金', '水'];

    // Relationships mapping
    const rels = [
        { key: 'induce', label: '正印', label2: '偏印', element: '' },
        { key: 'control', label: '正官', label2: '七杀', element: '' },
        { key: 'self', label: '劫财', label2: '比肩', element: '' },
        { key: 'wealth', label: '正财', label2: '偏财', element: '' },
        { key: 'output', label: '伤官', label2: '食神', element: '' }
    ];

    // Find elements for each relation relative to self
    const generationLoop = ['木', '火', '土', '金', '水'];
    const selfIdx = generationLoop.indexOf(selfEl);

    rels[0].element = generationLoop[(selfIdx + 4) % 5]; // Induce: Parent
    rels[1].element = generationLoop[(selfIdx + 2) % 5]; // Control: Grandparent
    rels[2].element = selfEl;                             // Self
    rels[3].element = generationLoop[(selfIdx + 1) % 5]; // Wealth: Child-controlled
    rels[4].element = generationLoop[(selfIdx + 1) % 5]; // Output: Child
    // Wait, let's fix the circular relationships:
    // Generate: Wood -> Fire -> Earth -> Metal -> Water -> Wood
    // Relations to Self (S):
    // Parent (P) -> S : Induce (印)
    // S -> Child (C) : Output (食)
    // S -> Victim (V) : Wealth (财)
    // Enemy (E) -> S : Power (官)

    const induceEl = generationLoop[(selfIdx + 4) % 5];
    const outputEl = generationLoop[(selfIdx + 1) % 5];
    const wealthEl = generationLoop[(selfIdx + 2) % 5];
    const powerEl = generationLoop[(selfIdx + 3) % 5];

    const chartData = [
        { label: '正印', label2: '偏印', el: induceEl, score: scores[induceEl] },
        { label: '正官', label2: '七杀', el: powerEl, score: scores[powerEl] },
        { label: '劫财', label2: '比肩', el: selfEl, score: scores[selfEl] },
        { label: '正财', label2: '偏财', el: wealthEl, score: scores[wealthEl] },
        { label: '伤官', label2: '食神', el: outputEl, score: scores[outputEl] }
    ];

    const chartWrapper = document.createElement('div');
    chartWrapper.className = 'bar-chart-container';

    chartData.forEach(item => {
        const row = document.createElement('div');
        row.className = 'bar-row';

        const labelGroup = document.createElement('div');
        labelGroup.className = 'bar-label-group';
        labelGroup.innerHTML = `<span class="text-${getElementClassForName(item.el)}">${item.label}</span>
                               <span class="text-${getElementClassForName(item.el)}">${item.label2}</span>`;

        const track = document.createElement('div');
        track.className = 'bar-track';

        const fill = document.createElement('div');
        fill.className = 'bar-fill el-bg-' + getElementClassForName(item.el);
        // Scores are out of 360 total roughly, max can be around 200+
        const widthPercent = Math.min(100, (item.score / 150) * 100);
        fill.style.width = '0%'; // For animation
        setTimeout(() => fill.style.width = widthPercent + '%', 100);

        const scoreTag = document.createElement('span');
        scoreTag.className = 'god-multi-labels';
        scoreTag.textContent = item.score;

        track.appendChild(fill);
        row.appendChild(labelGroup);
        row.appendChild(track);
        row.appendChild(scoreTag);
        chartWrapper.appendChild(row);
    });

    container.appendChild(chartWrapper);
}

function getElementClassForName(elName) {
    if (elName === '木') return 'wood';
    if (elName === '火') return 'fire';
    if (elName === '土') return 'earth';
    if (elName === '金') return 'metal';
    if (elName === '水') return 'water';
    return '';
}

function renderFiveElementsChart(scores, dayStem) {
    const container = document.getElementById('bazi-elements-chart-pc');
    if (!container) return;
    container.innerHTML = '';

    const selfElement = BaziUtils.ELEMENTS[dayStem];
    const elementsOrder = ['土', '金', '水', '木', '火']; 
    const r = 52; 
    const selfScore = scores[selfElement];
    let currentAngle = -90 - (selfScore / 2);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", 300);
    svg.setAttribute("height", 250);
    svg.setAttribute("viewBox", "0 0 300 250");
    svg.classList.add("chart-svg");

    const labelsLayer = document.createElement('div');
    labelsLayer.className = 'chart-labels-layer';

    const getPoint = (angle, radius) => {
        const rad = (angle * Math.PI) / 180;
        return {
            x: 150 + radius * Math.cos(rad),
            y: 125 + radius * Math.sin(rad)
        };
    };

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bg.setAttribute("cx", 150); bg.setAttribute("cy", 125);
    bg.setAttribute("r", r); bg.classList.add("chart-bg-circle");
    svg.appendChild(bg);

    const lb1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    lb1.setAttribute("cx", 150); lb1.setAttribute("cy", 125);
    lb1.setAttribute("r", r - 10); lb1.classList.add("chart-inner-border");
    svg.appendChild(lb1);

    const slices = [];
    let tempAngle = currentAngle;
    const selfBaseIdx = elementsOrder.indexOf(selfElement);
    const displayOrder = [];
    for (let i = 0; i < 5; i++) displayOrder.push(elementsOrder[(selfBaseIdx + i) % 5]);

    displayOrder.forEach((el, i) => {
        const score = scores[el];
        slices.push({
            el: el,
            angle: tempAngle + (score / 2),
            score: score,
            isSelf: i === 0
        });
        tempAngle += score;
    });

    const minAngleGap = 56; 
    for (let iter = 0; iter < 10; iter++) {
        for (let i = 1; i < slices.length; i++) {
            if (slices[i].angle - slices[i-1].angle < minAngleGap) {
                slices[i].angle = slices[i-1].angle + minAngleGap;
            }
        }
        if ((slices[0].angle + 360) - slices[4].angle < minAngleGap) {
            slices[4].angle = (slices[0].angle + 360) - minAngleGap;
            for (let i = 3; i >= 1; i--) {
                if (slices[i+1].angle - slices[i].angle < minAngleGap) {
                    slices[i].angle = slices[i+1].angle - minAngleGap;
                }
            }
        }
    }

    const elementToGods = {
        '木': ['甲', '乙'], '火': ['丙', '丁'], '土': ['戊', '己'],
        '金': ['庚', '辛'], '水': ['壬', '癸']
    };

    const boxes = slices.map(s => {
        let bx, by;
        if (s.isSelf) {
            bx = 150; by = -14; // Rule 1: Fixed
        } else {
            const rad = (s.angle * Math.PI) / 180;
            
            // Calculate exact mathematically safe distance using Minkowski sum 
            // of the circle and the label's rectangle.
            const scaleX = 175 / 300; 
            const scaleY = 150 / 250; 
            const W = (82 / scaleX) / 2; // Scaled Half-width
            const H = (50 / scaleY) / 2; // Scaled Half-height
            const R = 64 + 12; // Pie chart outer radius + 12px safe padding
            
            const cosT = Math.abs(Math.cos(rad));
            const sinT = Math.abs(Math.sin(rad));
            
            let d;
            if (sinT / cosT <= H / (W + R)) {
                // Hits right/left flat edge
                d = (W + R) / cosT;
            } else if (cosT / sinT <= W / (H + R)) {
                // Hits top/bottom flat edge
                d = (H + R) / sinT;
            } else {
                // Hits rounded corner
                const b = -2 * (W * cosT + H * sinT);
                const c = W * W + H * H - R * R;
                d = (-b + Math.sqrt(b * b - 4 * c)) / 2;
            }
            
            bx = 150 + Math.cos(rad) * d;
            by = 125 + Math.sin(rad) * d;
            
            // Removed arbitrary hard clamping to allow labels to naturally overflow 
            // the container boundaries just like the SVG does, ensuring they never 
            // squeeze into the inner cake.
        }

        return { x: bx, y: by, el: s.el, score: s.score };
    });

    const boxW = 82, boxH = 50;
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
        labelDiv.className = `element-label`;
        // Use percentage mapping to perfectly align the 300x250 virtual coordinates 
        // with the physical DOM Flexbox scaling of the SVG.
        labelDiv.style.left = `calc(${(box.x / 300) * 100}% - ${boxW / 2}px)`;
        labelDiv.style.top = `calc(${(box.y / 250) * 100}% - ${boxH / 2}px)`;
        labelDiv.style.width = `${boxW}px`;
        labelDiv.style.height = `${boxH}px`;

        const stems = elementToGods[el];
        let g1 = BaziUtils.getTenGod(dayStem, stems[0]);
        let g2 = BaziUtils.getTenGod(dayStem, stems[1]);
        const ROW1_TYPES = ['劫财', '伤官', '正财', '正官', '正印'];
        if (ROW1_TYPES.includes(g2) && !ROW1_TYPES.includes(g1)) [g1, g2] = [g2, g1];

        const elementColors = {
            '木': '#6d8e46', '火': '#f06292', '土': '#a17c5a', '金': '#ffb74d', '水': '#1689b6'
        };
        const activeColor = elementColors[el];

        labelDiv.innerHTML = `
            <div class="text-group" style="text-align: left; color: ${activeColor} !important; display: flex; flex-direction: column; align-items: flex-start;">
                <div class="god-row" style="display: flex; align-items: center; gap: 4px; width: 100%; justify-content: flex-start;">
                    <span class="god-name" style="min-width: 2em; text-align: left;">${g1}</span>
                    <div class="chart-color-box" style="background-color: ${activeColor} !important; border: 1px solid ${activeColor} !important; flex-shrink: 0;"></div>
                </div>
                <div class="god-row" style="display: flex; align-items: center; gap: 4px; width: 100%; justify-content: flex-start;">
                    <span class="god-name" style="min-width: 2em; text-align: left;">${g2}</span>
                    <span class="score-text" style="font-weight: 700; margin-left: 2px;">${score}</span>
                </div>
            </div>
        `;
        labelsLayer.appendChild(labelDiv);
    });

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 150);
    text.setAttribute("y", 125);
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("text-anchor", "middle");
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
    const luckList = document.getElementById('luck-list-pc');
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
    const annualList = document.getElementById('annual-list-pc');
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
    const monthlyList = document.getElementById('monthly-list-pc');
    if (!monthlyList) return;

    monthlyList.innerHTML = '';

    const yearGz = BaziUtils.getYearGanZhi(State.browsingYear);
    const months = BaziUtils.calculateMonthlyLuck(bazi.day.stem, yearGz.stem);
    const monthAbbrs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const now = new Date();
    const actualYear = now.getFullYear();
    const actualMonth = now.getMonth() + 1;
    const actualDay = now.getDate();

    months.forEach((m) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'luck-item-wrapper-monthly';

        // Logic to determine if this is the ACTUAL CURRENT month in real time
        let isActualCurrentMonth = false;
        if (State.browsingYear === actualYear) {
            // For 2026, Apr 24 is the 3rd month (index 3) starting from Feb
            if (actualMonth === 4 && m.index === 3) isActualCurrentMonth = true;
            else if (actualMonth === 2 && m.index === 1) isActualCurrentMonth = true;
            else if (actualMonth === 3 && m.index === 2) isActualCurrentMonth = true;
            else if (actualMonth === 5 && m.index === 4) isActualCurrentMonth = true;
            else if (actualMonth === 6 && m.index === 5) isActualCurrentMonth = true;
            else if (actualMonth === 7 && m.index === 6) isActualCurrentMonth = true;
            else if (actualMonth === 8 && m.index === 7) isActualCurrentMonth = true;
            else if (actualMonth === 9 && m.index === 8) isActualCurrentMonth = true;
            else if (actualMonth === 10 && m.index === 9) isActualCurrentMonth = true;
            else if (actualMonth === 11 && m.index === 10) isActualCurrentMonth = true;
            else if (actualMonth === 12 && m.index === 11) isActualCurrentMonth = true;
            else if (actualMonth === 1 && m.index === 12) isActualCurrentMonth = true;
        }

        const isBrowsingMonth = (m.index === State.browsingMonthIndex);

        // Selection Priority Logic: 
        // If the user has clicked a month (index != -1), only show the selected month in Water.
        // Otherwise, show the actual real-time current month in Fire.
        let highlightClass = '';
        if (State.browsingMonthIndex !== -1) {
            if (isBrowsingMonth) highlightClass = 'active-water';
        } else {
            if (isActualCurrentMonth) highlightClass = 'active-fire';
        }

        let monthNameStr = m.index <= 10 ? ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][m.index - 1] + '月' : m.index + '月';

        // Get 2 Solar Terms for this month
        const term1Idx = (m.index - 1) * 2;
        const term2Idx = term1Idx + 1;

        const getTermInfo = (idx) => {
            let ty = State.browsingYear;
            if (idx >= 22) ty += 1;
            const d = BaziUtils.getSolarTermDay(ty, idx);
            const mon = BaziUtils.getSolarTermMonth(idx);
            const monName = monthAbbrs[(mon > 12 ? mon - 12 : mon) - 1];

            let colorClass = '';
            if (idx >= 0 && idx <= 5) colorClass = 'text-wood';
            else if (idx >= 6 && idx <= 11) colorClass = 'text-fire';
            else if (idx >= 12 && idx <= 17) colorClass = 'text-metal';
            else if (idx >= 18 && idx <= 23) colorClass = 'text-water';

            // Identify ACTUAL CURRENT TERM (Gu Yu for Apr 24, 2026)
            let isCurrentTermText = false;
            if (actualYear === 2026 && actualMonth === 4 && actualDay >= 20 && idx === 5) {
                isCurrentTermText = true;
            }

            return {
                name: BaziUtils.SOLAR_TERMS[idx],
                day: d,
                mon: monName,
                color: colorClass,
                isCurrentTerm: isCurrentTermText
            };
        };

        const t1 = getTermInfo(term1Idx);
        const t2 = getTermInfo(term2Idx);

        // Uppercase the month abbreviations for the screenshot look
        const t1Mon = t1.mon.toUpperCase();
        const t2Mon = t2.mon.toUpperCase();

        itemWrapper.innerHTML = `
            <div class="luck-month-name" style="margin-bottom:10px;">${monthNameStr}</div>
            <div class="luck-box-monthly ${highlightClass}">
                <div class="monthly-row-huge">
                    <div class="luck-char-main ${getElementClass(m.stem)}">${m.stem}</div>
                    <div class="luck-god-vertical ${getElementClass(m.stem)}">${m.stemGod}</div>
                </div>
                <div class="monthly-row-huge">
                    <div class="luck-char-main ${getElementClass(m.branch)}">${m.branch}</div>
                    <div class="luck-god-vertical ${getElementClass(m.branch)}">${m.branchGod}</div>
                </div>
            </div>
            <div class="solar-term-pair-row">
                <div class="solar-term-item">
                    <div class="solar-name-vertical ${t1.color} ${t1.isCurrentTerm ? 'active-term-tag' : ''}">${t1.name}</div>
                    <div class="solar-date-vertical-stack">
                        <span class="day">${t1.day}</span>
                        <span class="mon">${t1Mon}</span>
                    </div>
                </div>
                <div class="solar-term-item">
                    <div class="solar-name-vertical ${t2.color} ${t2.isCurrentTerm ? 'active-term-tag' : ''}">${t2.name}</div>
                    <div class="solar-date-vertical-stack">
                        <span class="day">${t2.day}</span>
                        <span class="mon">${t2Mon}</span>
                    </div>
                </div>
            </div>
        `;

        itemWrapper.onclick = () => {
            State.browsingMonthIndex = (State.browsingMonthIndex === m.index) ? -1 : m.index;
            renderMonthlyLuck(record, bazi);
            renderDashboard(record);
        };

        monthlyList.appendChild(itemWrapper);
    });
}

function renderSolarTerms(record, bazi) {
    const solarList = document.getElementById('solar-list-pc');
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

    for (let i = 0; i < 24; i++) {
        const name = BaziUtils.SOLAR_TERMS[i];
        const item = document.createElement('div');
        item.className = 'solar-item';

        let seasonClass = '';
        if (i < 6) seasonClass = 'color-spring';
        else if (i < 12) seasonClass = 'color-summer';
        else if (i < 18) seasonClass = 'color-autumn';
        else seasonClass = 'color-winter';

        let targetYear = State.browsingYear;
        if (i >= 22) targetYear += 1;

        const day = BaziUtils.getSolarTermDay(targetYear, i);
        const month = BaziUtils.getSolarTermMonth(i);

        const isActive = isBrowsingCurrentYear && i === currentTermIdx;
        const activeClass = isActive ? 'active-solar-fire' : '';

        const monthAbbrs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const displayMonth = month > 12 ? month - 12 : month;
        const monthAbbr = monthAbbrs[displayMonth - 1];

        item.innerHTML = `
            <div class="solar-name-box ${seasonClass} ${activeClass}">${name}</div>
            <div class="solar-date"><span class="solar-day">${day}</span><span class="solar-mon">${monthAbbr}</span></div>
        `;
        solarList.appendChild(item);
    }
}



// --- Global System Funcs ---
function init() {
    initDropdowns();
    resetToToday();
    renderGroups();
    checkAuth();
    initBackgroundSystem();

    // Bind Context Menu Actions
    if (UI.menuRename) UI.menuRename.onclick = handleRename;
    if (UI.menuDelete) UI.menuDelete.onclick = handleDelete;

    UI.navIconBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            this.blur();
            if (btn.dataset.view) switchView(btn.dataset.view);
        });
    });

    // Special Sidebar Buttons
    const backupBtnPc = document.getElementById('backup-btn-pc');
    if (backupBtnPc) backupBtnPc.onclick = handleBackup;

    const navBtnBookPc = document.getElementById('nav-btn-book-pc');
    if (navBtnBookPc) navBtnBookPc.onclick = () => switchView('view-book');

    const logoutBtnPc = document.getElementById('logout-btn-pc');
    if (logoutBtnPc) logoutBtnPc.onclick = () => UI.btnLogoutSystem.click();

    UI.btnSaveChart.onclick = () => {
        const genderEl = document.querySelector('input[name="gender-pc"]:checked');
        const record = {
            id: 'r_' + Date.now(),
            name: UI.userName.value || '未知',
            gregYear: UI.gregYear.value,
            gregMonth: UI.gregMonth.value,
            gregDay: UI.gregDay.value,
            gregTime: UI.gregTime.value,
            gender: genderEl ? genderEl.value : 'M',
            groupId: State.lastUsedGroupId || 'default'
        };
        State.records.push(record);
        saveState(); renderGroups();
        switchView('dashboard-container');
        renderMainBoard(record);
    };

    UI.btnNewChart.onclick = () => resetToToday();

    UI.btnLogoutSystem.onclick = () => {
        if (confirm("确定要退出系统吗？")) {
            State.isLoggedIn = false;
            State.isFirstStagePassed = false;
            sessionStorage.removeItem('ziwi_auth_passed');
            sessionStorage.removeItem('ziwi_first_stage');
            checkAuth();
        }
    };

    // Correctly bind handleBackup to the hidden button so both mobile and PC buttons work
    if (UI.backupBtn) {
        UI.backupBtn.onclick = handleBackup;
    }

    // Explicit binding for snapshot
    if (UI.snapshotBtn) {
        UI.snapshotBtn.onclick = handleSnapshot;
    }

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
    UI.backupBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        this.blur();
        handleBackup();
    };

    // Enter Key Support for Login
    [UI.loginEmail, UI.loginPass].forEach(el => {
        el.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') UI.btnLogin.click();
        });
    });

    // Enter Key Support for Security
    [UI.secQ1, UI.secQ2, UI.secQ3, UI.secQ4, UI.secQ5].forEach(el => {
        el.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') UI.btnSecSubmit.click();
        });
    });
}

function handleSnapshot() {
    try {
        const record = State.currentActiveRecord;
        if (!record) {
            alert("请先选择或保存一个命盘后再截图");
            return;
        }

        // 1. Prepare Filename
        const now = new Date();
        const f2 = (n) => n.toString().padStart(2, '0');
        const todayStr = `${now.getFullYear()}${f2(now.getMonth() + 1)}${f2(now.getDate())}`;
        const timeStr = `${f2(now.getHours())}${f2(now.getMinutes())}`;

        const genderChar = record.gender === 'M' ? '男' : '女';
        const bYear = record.gregYear;
        const bMonth = f2(parseInt(record.gregMonth));
        const bDay = f2(parseInt(record.gregDay));
        const birthDateStr = `${bYear}${bMonth}${bDay}`;

        // Ensure birthTime has "时" and is just the Zhi character
        let birthTime = record.gregTime || "子";
        if (!birthTime.includes('时')) birthTime += '时';

        const fileName = `${todayStr} ${timeStr} ${record.name}${genderChar}${birthDateStr}${birthTime}.jpg`;

        // 2. Locate Elements
        const target = document.getElementById('chart-area-pc');
        if (!target) {
            console.error("Target #chart-area-pc not found");
            return;
        }

        // 3. Flash Animation Effect & Sound
        const shutterSound = new Audio('img/Canon DSLR Shutter Sound.mp3');
        shutterSound.play().catch(err => console.warn("Audio play failed:", err));

        const flash = document.createElement('div');
        flash.className = 'snapshot-flash';
        flash.setAttribute('data-html2canvas-ignore', 'true');
        target.appendChild(flash);

        // Remove flash element after animation ends
        setTimeout(() => flash.remove(), 600);

        console.log("Starting Snapshot for:", fileName);

        // 4. Capture using html2canvas
        // Note: We are NOT hiding tier-3 anymore as the user wants 3 layers of data.
        html2canvas(target, {
            useCORS: true,
            scale: 2, // High quality
            backgroundColor: "#ffffff",
            logging: false,
            // Ensure we capture the whole scrollable area
            width: target.scrollWidth,
            height: target.scrollHeight
        }).then(canvas => {
            // 5. Create robust download link
            const link = document.createElement('a');
            // User requested JPG
            link.href = canvas.toDataURL("image/jpeg", 0.95);
            link.download = fileName;

            document.body.appendChild(link);
            link.click();

            // Clean up
            setTimeout(() => {
                document.body.removeChild(link);
                console.log("Snapshot successfully saved.");
            }, 500);
        }).catch(err => {
            console.error("html2canvas Error:", err);
            alert("截图引擎出错，请刷新页面重试");
        });
    } catch (err) {
        console.error("Global Snapshot Error:", err);
        alert("操作失败：" + err.message);
    }
}
window.handleSnapshot = handleSnapshot;

function handleImport(content) {
    if (!content) return;

    // Split into non-empty lines
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
    let currentGroupId = 'default';
    let importCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Peek ahead to see if this is a record (Name, Gender, Date)
        const nextLine = lines[i + 1];
        const nextNextLine = lines[i + 2];

        const isGender = nextLine && (nextLine === "男" || nextLine === "女" || nextLine === "M" || nextLine === "F");
        const isDate = nextNextLine && (nextNextLine.includes("年") || nextNextLine.includes("月"));

        if (isGender && isDate) {
            // It's a record
            const name = line;
            const gender = (nextLine === "男" || nextLine === "M") ? "M" : "F";
            const dateLine = nextNextLine;

            const dateMatch = dateLine.match(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*(?:日|号)?\s*(.*)/);
            if (dateMatch) {
                const year = dateMatch[1];
                const month = dateMatch[2];
                const day = dateMatch[3];
                let timeRaw = dateMatch[4].trim();

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
                i += 2; // Jump over gender and date lines
            }
        } else {
            // It's a group name (or junk)
            let groupName = line;
            
            // Aggressively clean group names (remove Folder, Group, 名称, 群组 prefixes)
            groupName = groupName.replace(/^(Folder|Group|名称|群组|群组名称)[:：\s]*/i, "").trim();
            
            // If the cleaned name is actually one of the reserved words, we might have over-cleaned, 
            // but usually this is exactly what the user wants ("Ipoh" instead of "群组 Ipoh")
            
            if (groupName) {
                let group = State.groups.find(g => g.name === groupName);
                if (!group) {
                    group = { id: 'g_' + Date.now() + Math.random().toString(36).substr(2, 5), name: groupName };
                    State.groups.push(group);
                }
                currentGroupId = group.id;
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

    let content = "";

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

        // Folder/Group Name
        content += group.name + CRLF + CRLF;

        recs.forEach((r, index) => {
            const genderText = r.gender === 'M' ? '男' : '女';
            const timeStr = (r.gregTime || "子").replace('时', '') + "时";

            content += `${r.name}${CRLF}`;
            content += `${genderText}${CRLF}`;
            content += `${r.gregYear}年${r.gregMonth}月${r.gregDay}日 ${timeStr}${CRLF}`;

            if (index < recs.length - 1) {
                content += CRLF; // Single blank line between records
            }
        });

        content += CRLF + CRLF; // Double blank lines after a group
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BaZi_Backup_${new Date().toISOString().slice(0, 10)}.txt`;
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
        const overlay = document.getElementById('dashboard-bg-overlay');
        const chartArea = document.getElementById('chart-area-pc');
        const bgValue = src ? `url("${src}")` : 'none';

        if (overlay) overlay.style.backgroundImage = bgValue;
        if (chartArea) {
            chartArea.style.backgroundImage = bgValue;
            chartArea.style.backgroundSize = 'cover';
            chartArea.style.backgroundPosition = 'center';
            chartArea.style.backgroundRepeat = 'no-repeat';
        }
    };

    // Load saved background immediately
    const savedBg = localStorage.getItem('bazi_bg_image_pc_v2');
    if (savedBg) applyBg(savedBg);

    const btn = document.getElementById('bg-change-btn-pc');
    const input = document.getElementById('bg-upload-input');

    if (btn && input) {
        // Left Click: Open Picker
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.click();
        };

        // Right Click: Instant Clear (as per your request)
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            localStorage.removeItem('bazi_bg_image_pc_v2');
            applyBg(null);
            return false;
        };
    }

    if (input) {
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1080;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to JPEG with 0.8 quality to save space
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    try {
                        localStorage.setItem('bazi_bg_image_pc_v2', dataUrl);
                    } catch (err) {
                        console.warn('Could not save background to localStorage:', err);
                        alert('图片太大，无法持久保存。请尝试上传较小的图片。');
                    }
                    applyBg(dataUrl);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };
    }
}

init();

