/* Faceit Pulse - Real Live Faceit Statistics Overlay with Customization Engine */

(function () {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));

    let nickname = (params.get('nickname') || params.get('player') || params.get('user') || '').trim();
    let matchesLimit = parseInt(params.get('matches') || '30', 10);
    if (![10, 20, 30].includes(matchesLimit)) matchesLimit = 30;

    // Display & Cycle mode
    const displayMode = (params.get('mode') || 'cycle').toLowerCase(); // 'cycle' | 'matches' | 'today'
    const swapInterval = parseInt(params.get('swap') || '8', 10) * 1000;

    // Challenger Settings
    // showRank: default true (1)
    const showRank = params.get('showRank') !== '0' && params.get('rank') !== '0';
    // showIcon: default true (1)
    const showChallengerIcon = params.get('showChallengerIcon') !== '0' && params.get('showIcon') !== '0' && params.get('icon') !== '0';

    // Styling & Theme
    const bgParam = params.get('bg') || '';
    const mapParam = (params.get('map') || '').toLowerCase();
    const bgImageParam = params.get('bgImage') || params.get('img') || '';
    const accentParam = params.get('accent') || '';
    const themeParam = (params.get('theme') || 'dark').toLowerCase();

    // Direct Faceit Open API Client Key
    const DEFAULT_FACEIT_KEY = '37f50b4c-e9b0-411d-8113-11bfddbdbea8';
    let apiKey = params.get('token') || params.get('key') || DEFAULT_FACEIT_KEY;

    let isFetching = false;
    let cycleTimer = null;
    let activeSlideIndex = 0; // 0 = matches, 1 = today

    // Predefined high-res CS2 map backgrounds
    const MAP_PRESETS = {
        mirage: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_mirage.png',
        dust2: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_dust2.png',
        inferno: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_inferno.png',
        nuke: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_nuke.png',
        ancient: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_ancient.png',
        anubis: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_anubis.png'
    };

    function applyCustomStyles() {
        const widget = document.getElementById('streamWidget');
        if (!widget) return;

        // Theme (Light or Dark)
        if (themeParam === 'light' || bgParam === 'white' || bgParam === '#ffffff') {
            widget.classList.add('theme-light');
        } else {
            widget.classList.remove('theme-light');
        }

        // Accent Color
        if (accentParam) {
            let color = accentParam.startsWith('#') ? accentParam : `#${accentParam}`;
            widget.style.setProperty('--psw-accent', color);
            widget.style.setProperty('--psw-accent-glow', color + '55');
        }

        // Background settings
        if (bgParam === 'transparent' || bgParam === '1') {
            widget.classList.add('transparent-bg');
        } else if (bgParam === 'clear' || bgParam === 'full') {
            widget.classList.add('full-transparent-bg');
        } else if (bgParam && bgParam.startsWith('#')) {
            widget.style.setProperty('--psw-bg', bgParam);
        } else if (bgParam && !bgParam.includes('http')) {
            widget.style.setProperty('--psw-bg', `#${bgParam}`);
        }

        // Background image / map
        let bgUrl = bgImageParam;
        if (!bgUrl && mapParam && MAP_PRESETS[mapParam]) {
            bgUrl = MAP_PRESETS[mapParam];
        }

        if (bgUrl) {
            widget.classList.add('has-bg-image');
            widget.style.backgroundImage = `url("${bgUrl}")`;
        }
    }

    function setupBadgeVisibility(rankText, skillLevel, isChallenger) {
        const pill = document.getElementById('pswRankPill');
        const standaloneIcon = document.getElementById('pswStandaloneIcon');
        const levelBadge = document.getElementById('pswLevelBadge');
        const pillIcon = document.getElementById('pswPillIcon');

        if (!pill || !standaloneIcon || !levelBadge) return;

        // Reset
        pill.classList.remove('pill-hidden');
        standaloneIcon.classList.add('hidden');
        levelBadge.classList.add('hidden');
        if (pillIcon) pillIcon.style.display = '';

        // Case 1: Both ON (Image 2 & 3: showRank=true, showIcon=true)
        if (showRank && showChallengerIcon) {
            pill.classList.remove('pill-hidden');
            if (pillIcon) pillIcon.style.display = 'inline-flex';
            standaloneIcon.classList.add('hidden');
            levelBadge.classList.add('hidden');
        }
        // Case 2: Icon ON, Rank OFF (Image 4: showRank=false, showIcon=true)
        else if (!showRank && showChallengerIcon) {
            pill.classList.add('pill-hidden');
            standaloneIcon.classList.remove('hidden');
            levelBadge.classList.add('hidden');
        }
        // Case 3: Both OFF (Image 5: showRank=false, showIcon=false)
        else if (!showRank && !showChallengerIcon) {
            pill.classList.add('pill-hidden');
            standaloneIcon.classList.add('hidden');
            levelBadge.classList.remove('hidden');
            levelBadge.textContent = skillLevel || '10';
        }
        // Case 4: Rank ON, Icon OFF (showRank=true, showIcon=false)
        else {
            pill.classList.remove('pill-hidden');
            if (pillIcon) pillIcon.style.display = 'none';
            standaloneIcon.classList.add('hidden');
            levelBadge.classList.add('hidden');
        }
    }

    function getCountryHtml(countryCode) {
        if (!countryCode) return '';
        const cc = countryCode.toLowerCase();
        if (cc === 'ua') {
            return `<svg width="18" height="13" viewBox="0 0 18 13" style="border-radius:2px; display:inline-block; vertical-align:middle;"><rect width="18" height="6.5" fill="#005BBB"/><rect y="6.5" width="18" height="6.5" fill="#FFD700"/></svg>`;
        }
        return `<img src="https://flagcdn.com/20x15/${cc}.png" width="18" height="13" style="border-radius:2px; display:inline-block; vertical-align:middle;" alt="${cc}">`;
    }

    function renderStats(stats) {
        const widget = document.getElementById('streamWidget');
        if (widget) {
            widget.classList.remove('psw-updating');
            void widget.offsetWidth;
            widget.classList.add('psw-updating');
        }

        const elRank = document.getElementById('pswRankNum');
        const elElo = document.getElementById('pswElo');
        const elKdr = document.getElementById('pswKdr');
        const elFlag = document.getElementById('pswFlag');
        const elCountryRank = document.getElementById('pswCountryRank');
        const elHeader = document.getElementById('pswMatchesHeader');
        const elWinrate = document.getElementById('pswWinrate');
        const elKillsAdr = document.getElementById('pswKillsAdr');
        const elKdKr = document.getElementById('pswKdKr');

        // Today stats elements
        const elTodayWins = document.getElementById('pswTodayWins');
        const elTodayLosses = document.getElementById('pswTodayLosses');
        const elTodayKillsAdr = document.getElementById('pswTodayKillsAdr');
        const elTodayKd = document.getElementById('pswTodayKd');

        if (elRank && stats.rank !== undefined) elRank.textContent = stats.rank;
        if (elElo && stats.elo !== undefined) elElo.textContent = stats.elo;
        if (elKdr && stats.overallKdr !== undefined) elKdr.textContent = stats.overallKdr;
        if (elCountryRank && stats.countryRank !== undefined) elCountryRank.textContent = stats.countryRank ? `#${stats.countryRank}` : '';
        if (elHeader && stats.headerText !== undefined) elHeader.textContent = stats.headerText;
        if (elWinrate && stats.winRate !== undefined) elWinrate.textContent = stats.winRate;
        if (elKillsAdr && stats.killsAdr !== undefined) elKillsAdr.textContent = stats.killsAdr;
        if (elKdKr && stats.kdKr !== undefined) elKdKr.textContent = stats.kdKr;

        if (elTodayWins && stats.todayWins !== undefined) elTodayWins.textContent = stats.todayWins;
        if (elTodayLosses && stats.todayLosses !== undefined) elTodayLosses.textContent = stats.todayLosses;
        if (elTodayKillsAdr && stats.todayKillsAdr !== undefined) elTodayKillsAdr.textContent = stats.todayKillsAdr;
        if (elTodayKd && stats.todayKd !== undefined) elTodayKd.textContent = stats.todayKd;

        if (elFlag) {
            elFlag.innerHTML = stats.flagHtml || '';
        }

        setupBadgeVisibility(stats.rank, stats.skillLevel, stats.isChallenger);
    }

    async function fetchLivePlayerStats(userNick) {
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        };

        // 1. Fetch player profile
        let playerResp;
        try {
            playerResp = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(userNick)}`, { headers });
        } catch (netErr) {
            console.error('[Faceit Pulse] Network error fetching player:', netErr);
            return {
                rank: '!',
                elo: 'NET ERR',
                overallKdr: 'OFFLINE',
                countryRank: '',
                headerText: 'ПОМИЛКА МЕРЕЖІ З FACEIT',
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
                todayWins: 0,
                todayLosses: 0,
                todayKillsAdr: '— / —',
                todayKd: '—',
                flagHtml: ''
            };
        }

        if (!playerResp.ok) {
            console.error('[Faceit Pulse] Player not found:', userNick, playerResp.status);
            return {
                rank: '?',
                elo: '404',
                overallKdr: 'НЕ ЗНАЙДЕНО',
                countryRank: '',
                headerText: `НІК "${userNick}" НЕ ІСНУЄ НА FACEIT`,
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
                todayWins: 0,
                todayLosses: 0,
                todayKillsAdr: '— / —',
                todayKd: '—',
                flagHtml: ''
            };
        }

        const playerData = await playerResp.json();
        const playerId = playerData.player_id;
        const country = (playerData.country || '').toLowerCase();
        const cs2 = playerData.games?.cs2;

        if (!cs2) {
            return {
                rank: '—',
                elo: 'NO CS2',
                overallKdr: '—',
                countryRank: '',
                headerText: 'CS2 СТАТИСТИКА ВІДСУТНЯ',
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
                todayWins: 0,
                todayLosses: 0,
                todayKillsAdr: '— / —',
                todayKd: '—',
                flagHtml: getCountryHtml(country)
            };
        }

        const currentElo = cs2.faceit_elo || 0;
        const skillLevel = cs2.skill_level || 10;
        const region = cs2.region || 'EU';

        // 2. Parallel requests: Match stats (limit=30), Lifetime stats, Country ranking, Regional ranking
        const [statsData, lifetimeData, countryRankData, regionRankData] = await Promise.all([
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?limit=30`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
            country ? fetch(`https://open.faceit.com/data/v4/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}?country=${encodeURIComponent(country)}`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null) : Promise.resolve(null),
            fetch(`https://open.faceit.com/data/v4/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        ]);

        // Country rank position
        let countryPosition = '';
        if (countryRankData && countryRankData.position) {
            countryPosition = String(countryRankData.position);
        }

        // Rank badge: if player is Challenger (Top 1000 in region), show regional rank (e.g. #1 for donk)
        let rankBadge = `#${skillLevel}`;
        let isChallenger = false;
        if (regionRankData && regionRankData.position && regionRankData.position <= 1000) {
            rankBadge = `#${regionRankData.position}`;
            isChallenger = true;
        }

        // Lifetime KDR
        let overallKdrText = '— KDR';
        if (lifetimeData && lifetimeData.lifetime && lifetimeData.lifetime['Average K/D Ratio']) {
            overallKdrText = `${lifetimeData.lifetime['Average K/D Ratio']} KDR`;
        }

        // Process last N matches
        const allItems = statsData?.items || [];
        const limitMatches = allItems.slice(0, matchesLimit);
        const totalMatches = limitMatches.length;

        let wins = 0, totalKills = 0, totalDeaths = 0, totalAdr = 0, totalRounds = 0, countAdr = 0;
        limitMatches.forEach(item => {
            const s = item.stats || {};
            const isWinner = s.Result === '1' || s.Winner === s.Team;
            if (isWinner) wins++;

            const kills = parseFloat(s.Kills) || 0;
            const deaths = parseFloat(s.Deaths) || 0;
            const adr = parseFloat(s.ADR);
            const rounds = parseFloat(s.Rounds) || 0;

            totalKills += kills;
            totalDeaths += deaths;
            totalRounds += rounds;
            if (!isNaN(adr) && adr > 0) {
                totalAdr += adr;
                countAdr++;
            }
        });

        const winRateNum = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
        const avgKills = totalMatches > 0 ? (totalKills / totalMatches).toFixed(0) : '0';
        const avgAdr = countAdr > 0 ? (totalAdr / countAdr).toFixed(1) : '—';
        const recentKd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);
        const recentKr = totalRounds > 0 ? (totalKills / totalRounds).toFixed(2) : '—';

        if (overallKdrText === '— KDR' && totalDeaths > 0) {
            overallKdrText = `${recentKd} KDR`;
        }

        // 3. Compute STATS TODAY from match timestamps (Image 3)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        let todayWins = 0, todayLosses = 0, todayKills = 0, todayDeaths = 0, todayAdrTotal = 0, todayAdrCount = 0;
        allItems.forEach(item => {
            const s = item.stats || {};
            const finishedAt = s['Match Finished At'];
            if (finishedAt && finishedAt >= startOfToday) {
                const isWinner = s.Result === '1' || s.Winner === s.Team;
                if (isWinner) todayWins++;
                else todayLosses++;

                const kills = parseFloat(s.Kills) || 0;
                const deaths = parseFloat(s.Deaths) || 0;
                const adr = parseFloat(s.ADR);

                todayKills += kills;
                todayDeaths += deaths;
                if (!isNaN(adr) && adr > 0) {
                    todayAdrTotal += adr;
                    todayAdrCount++;
                }
            }
        });

        const todayTotalMatches = todayWins + todayLosses;
        const todayAvgKills = todayTotalMatches > 0 ? Math.round(todayKills / todayTotalMatches) : 0;
        const todayAvgAdr = todayAdrCount > 0 ? (todayAdrTotal / todayAdrCount).toFixed(1) : (todayTotalMatches > 0 ? '0' : '0');
        const todayKd = todayDeaths > 0 ? (todayKills / todayDeaths).toFixed(2) : (todayTotalMatches > 0 ? todayKills.toFixed(2) : '0');

        return {
            rank: rankBadge,
            skillLevel: skillLevel,
            isChallenger: isChallenger,
            elo: String(currentElo),
            overallKdr: overallKdrText,
            countryRank: countryPosition,
            headerText: `LAST ${totalMatches} MATCHES (${playerData.nickname})`,
            winRate: `${winRateNum}%`,
            killsAdr: `${avgKills} / ${avgAdr}`,
            kdKr: `${recentKd} / ${recentKr}`,
            todayWins: todayWins,
            todayLosses: todayLosses,
            todayKillsAdr: `${todayAvgKills}/${todayAvgAdr}`,
            todayKd: String(todayKd),
            flagHtml: getCountryHtml(country)
        };
    }

    // Slide Swapper Logic (Last 30 Matches ⇄ Stats Today)
    function setupSlideSwapping() {
        const slideMatches = document.getElementById('pswSlideMatches');
        const slideToday = document.getElementById('pswSlideToday');
        if (!slideMatches || !slideToday) return;

        if (cycleTimer) {
            clearInterval(cycleTimer);
            cycleTimer = null;
        }

        if (displayMode === 'matches') {
            slideMatches.classList.add('active');
            slideToday.classList.remove('active');
            return;
        }

        if (displayMode === 'today') {
            slideMatches.classList.remove('active');
            slideToday.classList.add('active');
            return;
        }

        // Default 'cycle' mode: auto-swap every 8s
        activeSlideIndex = 0;
        slideMatches.classList.add('active');
        slideToday.classList.remove('active');

        cycleTimer = setInterval(() => {
            if (activeSlideIndex === 0) {
                slideMatches.classList.remove('active');
                slideToday.classList.add('active');
                activeSlideIndex = 1;
            } else {
                slideToday.classList.remove('active');
                slideMatches.classList.add('active');
                activeSlideIndex = 0;
            }
        }, swapInterval);
    }

    async function update() {
        if (isFetching) return;
        isFetching = true;

        if (!nickname) {
            try {
                const savedNick = localStorage.getItem('pulse_widget_nickname');
                if (savedNick) nickname = savedNick;
            } catch (e) {}
        }

        if (!nickname) {
            renderStats({
                rank: '#10',
                skillLevel: 10,
                isChallenger: true,
                elo: 'CS2',
                overallKdr: 'PULSE',
                countryRank: '',
                headerText: 'ВКАЖІТЬ ?nickname=ВАШ_НІК У URL',
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
                todayWins: 0,
                todayLosses: 0,
                todayKillsAdr: '0/0',
                todayKd: '0',
                flagHtml: getCountryHtml('ua')
            });

            const header = document.getElementById('pswMatchesHeader');
            if (header) {
                header.style.cursor = 'pointer';
                header.onclick = () => {
                    const promptNick = prompt('Введіть ваш Faceit Nickname:');
                    if (promptNick && promptNick.trim()) {
                        nickname = promptNick.trim();
                        try { localStorage.setItem('pulse_widget_nickname', nickname); } catch (e) {}
                        isFetching = false;
                        update();
                    }
                };
            }
            isFetching = false;
            return;
        }

        try {
            try { localStorage.setItem('pulse_widget_nickname', nickname); } catch (e) {}
            const data = await fetchLivePlayerStats(nickname);
            if (data) {
                renderStats(data);
            }
        } catch (e) {
            console.error('[Faceit Pulse] Live update error:', e);
        } finally {
            isFetching = false;
        }
    }

    function init() {
        applyCustomStyles();
        setupSlideSwapping();
        update();

        // Auto-refresh live Faceit stats every 45s during stream
        setInterval(update, 45000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
