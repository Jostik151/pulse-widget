/* Faceit Pulse - Standalone Stream Overlay Controller */

(function () {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));

    let matchesCount = parseInt(params.get('matches') || '30', 10);
    if (![10, 20, 30].includes(matchesCount)) matchesCount = 30;
    const forceTransparent = params.get('bg') === 'transparent';

    const defaultStats = {
        rank: '#25',
        elo: '4244',
        overallKdr: '1.24 KDR',
        countryRank: '#3',
        winRate: '70%',
        killsAdr: '20 / 91.3',
        kdKr: '1.45 / 0.93'
    };

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
        const elCountryRank = document.getElementById('pswCountryRank');
        const elHeader = document.getElementById('pswMatchesHeader');
        const elWinrate = document.getElementById('pswWinrate');
        const elKillsAdr = document.getElementById('pswKillsAdr');
        const elKdKr = document.getElementById('pswKdKr');

        if (elRank) elRank.textContent = stats.rank || '#25';
        if (elElo) elElo.textContent = stats.elo || '4244';
        if (elKdr) elKdr.textContent = stats.overallKdr || '1.24 KDR';
        if (elCountryRank) elCountryRank.textContent = stats.countryRank || '#3';
        if (elHeader) elHeader.textContent = `LAST ${matchesCount} MATCHES`;
        if (elWinrate) elWinrate.textContent = stats.winRate || '70%';
        if (elKillsAdr) elKillsAdr.textContent = stats.killsAdr || '20 / 91.3';
        if (elKdKr) elKdKr.textContent = stats.kdKr || '1.45 / 0.93';
    }

    function loadSavedStats() {
        try {
            const saved = localStorage.getItem('pulse_widget_stats');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    }

    function init() {
        if (forceTransparent || params.get('transparent') === '1') {
            applyTransparent(true);
        }

        const saved = loadSavedStats();
        const initial = Object.assign({}, defaultStats, saved || {});

        // Override from URL params if present
        if (params.get('elo')) initial.elo = params.get('elo');
        if (params.get('rank')) initial.rank = '#' + params.get('rank').replace('#', '');
        if (params.get('kdr')) initial.overallKdr = params.get('kdr') + ' KDR';
        if (params.get('wr')) initial.winRate = params.get('wr');
        if (params.get('killsAdr')) initial.killsAdr = params.get('killsAdr');
        if (params.get('kdKr')) initial.kdKr = params.get('kdKr');

        renderStats(initial);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
