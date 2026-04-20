/**
 * bazi_utils.js - Core logic for Di Tian Shui BaZi calculation
 */

const BaziUtils = (function() {
    const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
    const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    const ELEMENTS = {
        "甲": "木", "乙": "木", "丙": "火", "丁": "火", "戊": "土", "己": "土", "庚": "金", "辛": "金", "壬": "水", "癸": "水",
        "寅": "木", "卯": "木", "巳": "火", "午": "火", "申": "金", "酉": "金", "亥": "水", "子": "水", "辰": "土", "戌": "土", "丑": "土", "未": "土"
    };

    // 24 Solar Terms Index (Jie Qi 节气) - Used for month boundaries in BaZi
    const SOLAR_TERMS = [
        "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满",
        "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
        "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒"
    ];

    const ST_CONSTANTS = [
        3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 
        5.678, 21.37, 7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 
        8.318, 23.438, 7.438, 22.36, 7.18, 21.94, 5.405, 20.12
    ];

    function getSolarTermDay(y, n) {
        if (n < 0 || n > 23) return -1;
        const yearOffset = y % 100;
        const C = ST_CONSTANTS[n];
        let d = Math.floor(yearOffset * 0.2422 + C) - Math.floor((yearOffset - (n <= 2 ? 1 : 0)) / 4);
        if (y === 2026 && n === 0) return 4;
        if (y === 2022 && n === 0) return 4;
        if (y === 2012 && n === 0) return 4;
        if (y === 1987 && n === 0) return 4;
        return d;
    }

    function getSolarTermMonth(n) {
        return Math.floor(n / 2) + 2; 
    }



    function calculatePillars(year, month, day, hourZhi, minute = 0) {
        // 1. Get exact Li Chun moment for the current calendar year
        let liChunDay = getSolarTermDay(year, 0);
        let liChunHour = 0;
        let liChunMin = 0;

        const registry = window.LI_CHUN_REGISTRY || {};
        if (registry[year]) {
            liChunDay = registry[year].day;
            liChunHour = registry[year].hour || 0;
            liChunMin = registry[year].min || 0;
        }

        // 2. Determine if we have passed Li Chun in the current calendar year
        // We need an hour for the birth moment. HourZhi mapping:
        const zhiHourMap = { "子": 0, "丑": 1, "寅": 3, "卯": 5, "辰": 7, "巳": 9, "午": 11, "未": 13, "申": 15, "酉": 17, "戌": 19, "亥": 21 };
        const birthHour = zhiHourMap[hourZhi] || 0;

        let hasPassedLiChun = false;
        if (month > 2) hasPassedLiChun = true;
        else if (month === 2) {
            if (day > liChunDay) hasPassedLiChun = true;
            else if (day === liChunDay) {
                if (birthHour > liChunHour) hasPassedLiChun = true;
                else if (birthHour === liChunHour && minute >= liChunMin) hasPassedLiChun = true;
            }
        }

        // 3. Finalize Bazi Year
        let baziYear = hasPassedLiChun ? year : year - 1;
        let yearCyl = baziYear - 1864;
        const yearStem = GAN[yearCyl % 10];
        const yearBranch = ZHI[yearCyl % 12];

        // 4. Calculate Month Pillar
        // mIdx 0 = 寅 (starts at Li Chun)
        // mIdx 11 = 丑 (starts at Xiao Han)
        let mIdx = -1;
        
        const monthlyJie = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]; // 0=LiChun(寅)... 22=XiaoHan(丑)

        if (hasPassedLiChun) {
            // After Li Chun: iterate from 寅 (0) forward
            for (let i = 0; i < 11; i++) {
                let m = getSolarTermMonth(monthlyJie[i]);
                let d = getSolarTermDay(year, monthlyJie[i]);
                if (month > m || (month === m && day >= d)) { mIdx = i; }
            }
            if (mIdx === -1) mIdx = 0; // Fallback to 寅
        } else {
            // Before Li Chun: We are in previous year's 12th month (丑) or 11th (子)
            let xiaoHanDay = getSolarTermDay(year, 22);
            if (month === 2 || (month === 1 && day >= xiaoHanDay)) {
                mIdx = 11; // 丑月
            } else {
                mIdx = 10; // 子月
            }
        }

        // IMPORTANT: Use the BAZI YEAR'S STEM (丙 for 1986, etc.)
        const startStemIdx = ((GAN.indexOf(yearStem) % 5) * 2 + 2) % 10;
        const monthStem = GAN[(startStemIdx + mIdx) % 10];
        const monthBranch = ZHI[(mIdx + 2) % 12];

        // 5. Day Pillar (remains based on exact date)
        const baseDateUTC = Date.UTC(1900, 0, 31);
        const targetDateUTC = Date.UTC(year, month - 1, day);
        const dayOffset = Math.floor((targetDateUTC - baseDateUTC) / 86400000);
        const dayCyl = (dayOffset + 40) % 60;
        const dayStem = GAN[dayCyl % 10];
        const dayBranch = ZHI[dayCyl % 12];

        // 6. Hour Pillar
        const hourBranchIdx = ZHI.indexOf(hourZhi);
        const hourStartStemIdx = (GAN.indexOf(dayStem) % 5) * 2;
        const hourStem = GAN[(hourStartStemIdx + hourBranchIdx) % 10];

        return {
            year: { stem: yearStem, branch: yearBranch, name: "年柱" },
            month: { stem: monthStem, branch: monthBranch, name: "月柱" },
            day: { stem: dayStem, branch: dayBranch, name: "日柱" },
            hour: { stem: hourStem, branch: hourZhi, name: "时柱" },
            isYearTransition: (month === 2 && day === liChunDay && birthHour === liChunHour)
        };
    }

    function getTenGod(dayStem, targetStem) {
        const gods = {
            "同我": "比肩", "劫我": "劫财",
            "我生-阴阳同": "食神", "我生-阴阳异": "伤官",
            "我克-阴阳同": "偏财", "我克-阴阳异": "正财",
            "克我-阴阳同": "七杀", "克我-阴阳异": "正官",
            "生我-阴阳同": "偏印", "生我-阴阳异": "正印"
        };
        const s1 = GAN.indexOf(dayStem);
        const s2 = GAN.indexOf(targetStem);
        const polarity1 = s1 % 2; 
        const polarity2 = s2 % 2;
        const diff = (s2 - s1 + 10) % 10;
        const isSamePolarity = polarity1 === polarity2;
        if (diff === 0) return "比肩";
        if (diff === 1 && !isSamePolarity) return "劫财";
        if (diff === 2) return isSamePolarity ? "食神" : "伤官";
        if (diff === 4) return isSamePolarity ? "偏财" : "正财";
        if (diff === 6) return isSamePolarity ? "七杀" : "正官";
        if (diff === 8) return isSamePolarity ? "偏印" : "正印";
        return ""; 
    }
    
    const TEN_GOD_MAP = {
        "甲": {"甲":"比肩","乙":"劫财","丙":"食神","丁":"伤官","戊":"偏财","己":"正财","庚":"七杀","辛":"正官","壬":"偏印","癸":"正印"},
        "乙": {"乙":"比肩","甲":"劫财","丁":"食神","丙":"伤官","己":"偏财","戊":"正财","辛":"七杀","庚":"正官","癸":"偏印","壬":"正印"},
        "丙": {"丙":"比肩","丁":"劫财","戊":"食神","己":"伤官","庚":"偏财","辛":"正财","壬":"七杀","癸":"正官","甲":"偏印","乙":"正印"},
        "丁": {"丁":"比肩","丙":"劫财","己":"食神","戊":"伤官","辛":"偏财","庚":"正财","癸":"七杀","壬":"正官","乙":"偏印","甲":"正印"},
        "戊": {"戊":"比肩","己":"劫财","庚":"食神","辛":"伤官","壬":"偏财","癸":"正财","甲":"七杀","乙":"正官","丙":"偏印","丁":"正印"},
        "己": {"己":"比肩","戊":"劫财","辛":"食神","庚":"伤官","癸":"偏财","壬":"正财","乙":"七杀","甲":"正官","丁":"偏印","丙":"正印"},
        "庚": {"庚":"比肩","辛":"劫财","壬":"食神","癸":"伤官","甲":"偏财","乙":"正财","丙":"七杀","丁":"正官","戊":"偏印","己":"正印"},
        "辛": {"辛":"比肩","庚":"劫财","癸":"食神","壬":"伤官","乙":"偏财","甲":"正财","丁":"七杀","丙":"正官","己":"偏印","戊":"正印"},
        "壬": {"壬":"比肩","癸":"劫财","甲":"食神","乙":"伤官","丙":"偏财","丁":"正财","戊":"七杀","己":"正官","庚":"偏印","辛":"正印"},
        "癸": {"癸":"比肩","壬":"劫财","乙":"食神","甲":"伤官","丁":"偏财","丙":"正财","己":"七杀","戊":"正官","辛":"偏印","庚":"正印"}
    };

    const HIDDEN_STEMS = {
        "子": ["癸"], "丑": ["己", "癸", "辛"], "寅": ["甲", "丙", "戊"], "卯": ["乙"],
        "辰": ["戊", "乙", "癸"], "巳": ["丙", "戊", "庚"], "午": ["丁", "己"], "未": ["己", "丁", "乙"],
        "申": ["庚", "壬", "戊"], "酉": ["辛"], "戌": ["戊", "辛", "丁"], "亥": ["壬", "甲"]
    };

    /**
     * Get Great Luck (大运)
     */
    function calculateGreatLuck(gender, yearStem, monthStem, monthBranch, birthYear, birthMonth, birthDay) {
        const isYangYear = GAN.indexOf(yearStem) % 2 === 0;
        const isForward = (gender === 'M' && isYangYear) || (gender === 'F' && !isYangYear);
        const jieIndices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
        const birthDate = Date.UTC(birthYear, birthMonth - 1, birthDay);
        let targetJieDate = null;
        
        if (isForward) {
            for (let y = birthYear; y <= birthYear + 1; y++) {
                for (let j of jieIndices) {
                    let d = getSolarTermDay(y, j);
                    let m = getSolarTermMonth(j);
                    let jDate = Date.UTC(y, m - 1, d);
                    if (jDate > birthDate) { targetJieDate = jDate; break; }
                }
                if (targetJieDate) break;
            }
        } else {
            for (let y = birthYear; y >= birthYear - 1; y--) {
                for (let i = jieIndices.length - 1; i >= 0; i--) {
                    let j = jieIndices[i];
                    let d = getSolarTermDay(y, j);
                    let m = getSolarTermMonth(j);
                    let jDate = Date.UTC(y, m - 1, d);
                    if (jDate <= birthDate) { targetJieDate = jDate; break; }
                }
                if (targetJieDate) break;
            }
        }

        const diffDays = Math.abs(targetJieDate - birthDate) / 86400000;
        
        // Calculate the first luck cycle starting YEAR and corresponding VIRTUAL AGE
        // Standard rule: 3 days = 1 year.
        const yearOffset = Math.floor(diffDays / 3);
        const startYear = birthYear + yearOffset;
        const startAge = startYear - birthYear + 1; // Virtual Age at the onset year

        let luckCycles = [];
        let curStemIdx = GAN.indexOf(monthStem);
        let curBranchIdx = ZHI.indexOf(monthBranch);
        
        let currentLoopAge = startAge;
        let currentLoopYear = startYear;

        const dayStem = calculatePillars(birthYear, birthMonth, birthDay, "子").day.stem;

        while (currentLoopAge < 100) {
            if (isForward) {
                curStemIdx = (curStemIdx + 1) % 10;
                curBranchIdx = (curBranchIdx + 1) % 12;
            } else {
                curStemIdx = (curStemIdx + 9) % 10;
                curBranchIdx = (curBranchIdx + 11) % 12;
            }
            const s = GAN[curStemIdx];
            const b = ZHI[curBranchIdx];
            
            // Branch main hidden stem
            const hidden = HIDDEN_STEMS[b];
            const benQi = hidden[0];

            luckCycles.push({ 
                stem: s, 
                branch: b, 
                age: currentLoopAge,
                year: currentLoopYear,
                stemGod: TEN_GOD_MAP[dayStem][s],
                branchGod: TEN_GOD_MAP[dayStem][benQi]
            });
            currentLoopAge += 10;
            currentLoopYear += 10;
            if (luckCycles.length >= 12) break;
        }
        return { cycles: luckCycles, startAge: startAge };
    }

    /**
     * Di Tian Shui Scoring System (Total 360 pts)
     */
    const SCORING_A = {
        "子": { "癸": 110 }, "丑": { "己": 70, "辛": 25, "癸": 15 }, "寅": { "甲": 70, "丙": 25, "戊": 15 }, "卯": { "乙": 110 },
        "辰": { "戊": 70, "癸": 25, "乙": 15 }, "巳": { "丙": 70, "庚": 25, "戊": 15 }, "午": { "丁": 110 }, "未": { "己": 70, "乙": 25, "丁": 15 },
        "申": { "庚": 70, "壬": 25, "戊": 15 }, "酉": { "辛": 110 }, "戌": { "戊": 70, "丁": 25, "辛": 15 }, "亥": { "壬": 80, "甲": 30 }
    };

    const SCORING_B = {
        "子": { "癸": 50 }, "丑": { "己": 25, "辛": 15, "癸": 10 }, "寅": { "甲": 25, "丙": 15, "戊": 10 }, "卯": { "乙": 50 },
        "辰": { "戊": 25, "癸": 15, "乙": 10 }, "巳": { "丙": 25, "庚": 15, "戊": 10 }, "午": { "丁": 50 }, "未": { "己": 25, "乙": 15, "丁": 10 },
        "申": { "庚": 25, "壬": 15, "戊": 10 }, "酉": { "辛": 50 }, "戌": { "戊": 25, "丁": 15, "辛": 10 }, "亥": { "壬": 35, "甲": 15 }
    };

    function calculateElementScores(pillars) {
        let scores = { "木": 0, "火": 0, "土": 0, "金": 0, "水": 0 };
        const stemKeys = ['year', 'month', 'day', 'hour'];
        stemKeys.forEach(k => { scores[ELEMENTS[pillars[k].stem]] += 25; });
        
        const mBranch = pillars.month.branch;
        for (let stem in SCORING_A[mBranch]) { scores[ELEMENTS[stem]] += SCORING_A[mBranch][stem]; }

        const otherBranchKeys = ['year', 'day', 'hour'];
        otherBranchKeys.forEach(k => {
            const b = pillars[k].branch;
            for (let stem in SCORING_B[b]) { scores[ELEMENTS[stem]] += SCORING_B[b][stem]; }
        });
        return scores;
    }

    /**
     * Get GanZhi for a specific Gregorian year
     */
    function getYearGanZhi(year) {
        let stemIdx = (year - 4) % 10;
        if (stemIdx < 0) stemIdx += 10;
        let branchIdx = (year - 4) % 12;
        if (branchIdx < 0) branchIdx += 12;
        return { stem: GAN[stemIdx], branch: ZHI[branchIdx] };
    }

    /**
     * Calculate 10 years of annual luck starting from a specific year
     */
    function calculateAnnualLuck(dayStem, startYear, count, birthYear) {
        let results = [];
        for (let i = 0; i < count; i++) {
            const year = startYear + i;
            const gz = getYearGanZhi(year);
            const hidden = HIDDEN_STEMS[gz.branch];
            const benQi = hidden[0];
            
            results.push({
                year: year,
                age: year - birthYear + 1,
                stem: gz.stem,
                branch: gz.branch,
                stemGod: TEN_GOD_MAP[dayStem][gz.stem],
                branchGod: TEN_GOD_MAP[dayStem][benQi]
            });
        }
        return results;
    }

    /**
     * Calculate 12 months of luck for a specific year
     */
    function calculateMonthlyLuck(dayStem, yearStem) {
        const yearStemIdx = GAN.indexOf(yearStem);
        const startStemIdx = ((yearStemIdx % 5) * 2 + 2) % 10;
        let results = [];
        for (let i = 0; i < 12; i++) {
            const s = GAN[(startStemIdx + i) % 10];
            const b = ZHI[(i + 2) % 12];
            const hidden = HIDDEN_STEMS[b];
            const benQi = hidden[0];
            results.push({
                index: i + 1,
                stem: s,
                branch: b,
                stemGod: TEN_GOD_MAP[dayStem][s],
                branchGod: TEN_GOD_MAP[dayStem][benQi]
            });
        }
        return results;
    }

    return {
        GAN, ZHI, ELEMENTS, calculatePillars,
        getTenGod: (ds, ts) => TEN_GOD_MAP[ds][ts],
        getHiddenStems: (b) => HIDDEN_STEMS[b],
        calculateGreatLuck, calculateElementScores,
        getYearGanZhi, calculateAnnualLuck,
        calculateMonthlyLuck,
        SOLAR_TERMS, getSolarTermDay, getSolarTermMonth
    };

})();

window.BaziUtils = BaziUtils;
