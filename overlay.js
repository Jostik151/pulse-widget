/* Faceit Pulse - Real Live Faceit Statistics Overlay for OBS Studio & Streamlabs */

(function () {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));

    let nickname = params.get('nickname') || params.get('player') || params.get('user') || '';
    let matchesLimit = parseInt(params.get('matches') || '30', 10);
    if (![10, 20, 30].includes(matchesLimit)) matchesLimit = 30;
    const forceTransparent = params.get('bg') === 'transparent' || params.get('transparent') === '1';

    let cachedApiKey = null;
    let isFetching = false;

    function applyTransparent(isTransparent) {
        const widget = document.getElementById('streamWidget');
        if (!widget) return;
        if (isTransparent) {
            widget.classList.add('transparent-bg');
        } else {
            widget.classList.remove('transparent-bg');
        }
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

        if (elRank && stats.rank !== undefined) elRank.textContent = stats.rank;
        if (elElo && stats.elo !== undefined) elElo.textContent = stats.elo;
        if (elKdr && stats.overallKdr !== undefined) elKdr.textContent = stats.overallKdr;
        if (elCountryRank && stats.countryRank !== undefined) elCountryRank.textContent = stats.countryRank ? `#${stats.countryRank}` : '';
        if (elHeader && stats.headerText !== undefined) elHeader.textContent = stats.headerText;
        if (elWinrate && stats.winRate !== undefined) elWinrate.textContent = stats.winRate;
        if (elKillsAdr && stats.killsAdr !== undefined) elKillsAdr.textContent = stats.killsAdr;
        if (elKdKr && stats.kdKr !== undefined) elKdKr.textContent = stats.kdKr;

        if (elFlag && stats.flagHtml) {
            elFlag.innerHTML = stats.flagHtml;
        }
    }

    async function getFaceitApiKey() {
        if (cachedApiKey) return cachedApiKey;
        try {
            const resp = await fetch('https://api.fforecast.net/v1/faceit/access-token');
            if (resp.ok) {
                cachedApiKey = (await resp.text()).trim();
                return cachedApiKey;
            }
        } catch (e) {
            console.warn('[Faceit Pulse] Failed to fetch token:', e);
        }
        return null;
    }

    function getCountryHtml(countryCode) {
        if (!countryCode) return '';
        const cc = countryCode.toLowerCase();
        if (cc === 'ua') {
            return `<svg width="18" height="13" viewBox="0 0 18 13" style="border-radius:2px; display:inline-block; vertical-align:middle;"><rect width="18" height="6.5" fill="#005BBB"/><rect y="6.5" width="18" height="6.5" fill="#FFD700"/></svg>`;
        }
        return `<img src="https://flagcdn.com/20x15/${cc}.png" width="18" height="13" style="border-radius:2px; display:inline-block; vertical-align:middle;" alt="${cc}">`;
    }

    async function fetchLivePlayerStats(userNick) {
        const apiKey = await getFaceitApiKey();
        if (!apiKey) {
            console.error('[Faceit Pulse] No API token available');
            return null;
        }

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        };

        // 1. Fetch player profile
        const playerResp = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(userNick)}`, { headers });
        if (!playerResp.ok) {
            console.error('[Faceit Pulse] Player not found:', userNick, playerResp.status);
            return {
                rank: '!',
                elo: 'ERROR',
                overallKdr: 'NOT FOUND',
                countryRank: '',
                headerText: `ГРАВЦЯ "${userNick}" НЕ ЗНАЙДЕНО`,
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
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
                flagHtml: getCountryHtml(country)
            };
        }

        const currentElo = cs2.faceit_elo || 0;
        const skillLevel = cs2.skill_level || 10;
        const region = cs2.region || 'EU';

        // 2. Fetch match stats, lifetime stats, and rankings in parallel
        const [statsData, lifetimeData, rankData] = await Promise.all([
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?limit=${matchesLimit}`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null),
            country ? fetch(`https://open.faceit.com/data/v4/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}?country=${encodeURIComponent(country)}`, { headers })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null) : Promise.resolve(null)
        ]);

        // Country rank
        let countryPosition = '';
        if (rankData && rankData.position) {
            countryPosition = String(rankData.position);
        }

        // Lifetime KDR
        let overallKdrText = '— KDR';
        if (lifetimeData && lifetimeData.lifetime && lifetimeData.lifetime['Average K/D Ratio']) {
            overallKdrText = `${lifetimeData.lifetime['Average K/D Ratio']} KDR`;
        }

        // Process last N matches
        const items = statsData?.items || [];
        const totalMatches = items.length;

        if (totalMatches === 0) {
            return {
                rank: `#${skillLevel}`,
                elo: String(currentElo),
                overallKdr: overallKdrText,
                countryRank: countryPosition,
                headerText: `LAST ${matchesLimit} MATCHES (${userNick})`,
                winRate: '0%',
                killsAdr: '— / —',
                kdKr: '— / —',
                flagHtml: getCountryHtml(country)
            };
        }

        let wins = 0;
        let totalKills = 0;
        let totalDeaths = 0;
        let totalAdr = 0;
        let totalRounds = 0;
        let countAdr = 0;

        items.forEach(item => {
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

        const winRateNum = Math.round((wins / totalMatches) * 100);
        const avgKills = (totalKills / totalMatches).toFixed(0);
        const avgAdr = countAdr > 0 ? (totalAdr / countAdr).toFixed(1) : '—';
        const recentKd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : (totalKills).toFixed(2);
        const recentKr = totalRounds > 0 ? (totalKills / totalRounds).toFixed(2) : '—';

        if (overallKdrText === '— KDR' && totalDeaths > 0) {
            overallKdrText = `${recentKd} KDR`;
        }

        return {
            rank: `#${skillLevel}`,
            elo: String(currentElo),
            overallKdr: overallKdrText,
            countryRank: countryPosition,
            headerText: `LAST ${totalMatches} MATCHES (${userNick})`,
            winRate: `${winRateNum}%`,
            killsAdr: `${avgKills} / ${avgAdr}`,
            kdKr: `${recentKd} / ${recentKr}`,
            flagHtml: getCountryHtml(country)
        };
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
                rank: 'LIVE',
                elo: 'CS2',
                overallKdr: 'PULSE',
                countryRank: '',
                headerText: 'ВКАЖІТЬ ?nickname=ВАШ_НІК У URL',
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
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
        if (forceTransparent) {
            applyTransparent(true);
        }

        update();

        // Auto-refresh live stats every 45s during stream
        setInterval(update, 45000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
