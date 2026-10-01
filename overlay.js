/* Faceit Pulse - Advanced Multi-Layout Overlay Controller */

(function () {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, '?'));

    let nickname = (params.get('nickname') || params.get('player') || params.get('user') || '').trim();
    let matchesLimit = parseInt(params.get('matches') || '30', 10);
    if (![10, 20, 30].includes(matchesLimit)) matchesLimit = 30;

    // Layout Template selection
    const layout = (params.get('layout') || params.get('style') || 'compact').toLowerCase(); // 'compact' | 'pro' | 'wide'

    // Display & Cycle mode
    const displayMode = (params.get('mode') || 'cycle').toLowerCase(); // 'cycle' | 'matches' | 'today'
    const swapInterval = parseInt(params.get('swap') || '8', 10) * 1000;

    // Challenger Settings
    const showRank = params.get('showRank') !== '0' && params.get('rank') !== '0';
    const showChallengerIcon = params.get('showChallengerIcon') !== '0' && params.get('showIcon') !== '0' && params.get('icon') !== '0';

    // Styling & Theme
    const bgParam = params.get('bg') || '';
    const mapParam = (params.get('map') || '').toLowerCase();
    const bgImageParam = params.get('bgImage') || params.get('img') || '';
    const accentParam = params.get('accent') || '';
    const themeParam = (params.get('theme') || 'dark').toLowerCase();

    // Direct Faceit Open API Key
    const DEFAULT_FACEIT_KEY = '37f50b4c-e9b0-411d-8113-11bfddbdbea8';
    let apiKey = params.get('token') || params.get('key') || DEFAULT_FACEIT_KEY;

    let isFetching = false;
    let cycleTimer = null;
    let activeSlideIndex = 0; // 0 = matches, 1 = today

    const MAP_PRESETS = {
        mirage: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_mirage.png',
        dust2: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_dust2.png',
        inferno: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_inferno.png',
        nuke: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_nuke.png',
        ancient: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_ancient.png',
        anubis: 'https://cdn.fforecast.net/web/images/maps/48/map_icon_de_anubis.png'
    };

    function applyCustomStyles() {
        const isPro = layout === 'pro' || layout === 'wide';
        const widget = isPro ? document.getElementById('pulseProBanner') : document.getElementById('streamWidget');
        const compactWidget = document.getElementById('streamWidget');
        const proWidget = document.getElementById('pulseProBanner');

        if (isPro) {
            if (proWidget) proWidget.style.display = 'block';
            if (compactWidget) compactWidget.style.display = 'none';
        } else {
            if (compactWidget) compactWidget.style.display = 'block';
            if (proWidget) proWidget.style.display = 'none';
        }

        if (!widget) return;

        // Theme (Light)
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
            widget.style.setProperty('--pro-border', color);
            widget.style.setProperty('--pro-border-glow', color + '44');
        }

        // Background settings
        if (bgParam === 'transparent' || bgParam === '1') {
            widget.classList.add('transparent-bg');
        } else if (bgParam && bgParam.startsWith('#')) {
            widget.style.setProperty('--psw-bg', bgParam);
            widget.style.background = bgParam;
        }

        // Map photo background
        let bgUrl = bgImageParam;
        if (!bgUrl && mapParam && MAP_PRESETS[mapParam]) {
            bgUrl = MAP_PRESETS[mapParam];
        }

        if (bgUrl) {
            widget.classList.add('has-bg-image');
            widget.style.backgroundImage = `url("${bgUrl}")`;
        }
    }

    const FACEIT_LEVEL_COLORS = {
        1: '#EEE', 2: '#1CE400', 3: '#1CE400', 4: '#FFC800', 5: '#FFC800',
        6: '#FFC800', 7: '#FFC800', 8: '#FF6309', 9: '#FF6309', 10: '#FE1F00'
    };

    const FACEIT_PROGRESS_PATHS = {
        1: 'M5.894 15.816 3.858 17.09a9.656 9.656 0 0 0 1.894 2.2l1.562-1.822a7.206 7.206 0 0 1-1.42-1.65v-.002Z',
        2: 'm5.257 14.53-2.249.842a9.613 9.613 0 0 0 2.743 3.917l1.563-1.822a7.203 7.203 0 0 1-2.057-2.937Z',
        3: 'M2.4 12a9.58 9.58 0 0 0 3.352 7.29l1.562-1.823A7.184 7.184 0 0 1 4.801 12H2.4Z',
        4: 'M6.91 6.91 5.211 5.211A9.57 9.57 0 0 0 2.4 12a9.58 9.58 0 0 0 3.352 7.289l1.562-1.822A7.184 7.184 0 0 1 4.801 12c0-1.988.806-3.788 2.109-5.09Z',
        5: 'M12 2.4A9.6 9.6 0 0 0 2.4 12a9.58 9.58 0 0 0 3.352 7.29l1.562-1.823A7.2 7.2 0 0 1 12 4.8V2.4Z',
        6: 'M15.816 5.895a7.2 7.2 0 0 0-8.502 11.572l-1.562 1.822A9.58 9.58 0 0 1 2.4 12a9.6 9.6 0 0 1 14.689-8.142l-1.273 2.037Z',
        7: 'M17.934 7.92a7.2 7.2 0 1 0-10.62 9.546L5.752 19.29A9.58 9.58 0 0 1 2.4 12a9.6 9.6 0 0 1 17.512-5.44l-1.978 1.36Z',
        8: 'M19.2 12h2.4a9.6 9.6 0 1 0-19.2 0 9.58 9.58 0 0 0 3.352 7.29l1.562-1.823A7.2 7.2 0 1 1 19.2 12Z',
        9: 'M18.517 15.066a7.2 7.2 0 1 0-11.202 2.4L5.751 19.29A9.58 9.58 0 0 1 2.4 12a9.6 9.6 0 0 1 19.2 0 9.563 9.563 0 0 1-.91 4.089l-2.173-1.023Z',
        full: 'M16.686 17.467a7.2 7.2 0 1 0-9.371 0l-1.563 1.822A9.58 9.58 0 0 1 2.4 12a9.6 9.6 0 1 1 19.2 0 9.58 9.58 0 0 1-3.352 7.29l-1.562-1.823Z'
    };

    const FACEIT_DIGIT_PATHS = {
        '1': 'm11.765 10.233-1.487.824v-1.034L12 8.948h.991V14.4h-1.226v-4.167Z',
        '1_16': 'm9.233 10.233-1.487.824v-1.034l1.722-1.075h.991V14.4H9.233v-4.167Z',
        '2': 'M10.05 13.157c0-.303.084-.566.252-.79a1.6 1.6 0 0 1 .655-.512 8.18 8.18 0 0 1 .748-.286c.233-.071.456-.173.663-.302.157-.107.235-.233.235-.378v-.698c0-.173-.07-.288-.21-.344-.15-.062-.386-.092-.705-.092-.387 0-.896.07-1.529.21V9.04a8.522 8.522 0 0 1 1.756-.177c.66 0 1.15.101 1.47.303.324.201.487.537.487 1.008v.756c0 .285-.087.534-.26.747-.174.211-.4.373-.656.47-.252.107-.51.202-.773.286a2.65 2.65 0 0 0-.68.336c-.162.123-.244.27-.244.437v.277h2.621v.916h-3.83v-1.242Z',
        '3': 'M11.79 14.484c-.47 0-1.08-.042-1.831-.126v-.975l.269.05c.106.023.165.037.176.043l.286.05c.067.011.21.028.428.05.168.017.339.026.513.026.324 0 .548-.04.672-.118.128-.078.193-.227.193-.445v-.63c0-.263-.283-.395-.849-.395h-.99v-.84h.99c.437 0 .656-.16.656-.479v-.529a.453.453 0 0 0-.068-.269c-.044-.067-.126-.114-.243-.142a2.24 2.24 0 0 0-.504-.042c-.32 0-.812.033-1.479.1V8.94c.762-.05 1.3-.076 1.613-.076.683 0 1.176.079 1.479.235.308.157.462.434.462.832v.899a.62.62 0 0 1-.152.42.703.703 0 0 1-.37.227c.494.173.74.445.74.814v.89c0 .466-.16.799-.479 1-.319.202-.823.303-1.512.303Z',
        '4': 'M12.303 13.3h-2.52v-.967l2.243-3.385h1.386v3.47H14v.881h-.588v1.1h-1.109v-1.1.001Zm0-.883v-2.31l-1.47 2.31h1.47Z',
        '5': 'M11.815 14.484c-.386 0-.966-.031-1.739-.093v-1.016c.695.129 1.218.193 1.571.193.308 0 .532-.033.672-.1a.357.357 0 0 0 .21-.337v-.814c0-.152-.05-.258-.151-.32-.101-.067-.266-.1-.496-.1h-1.68V8.948h3.444v.941H11.43v1.109h.856c.325 0 .642.061.95.185a.91.91 0 0 1 .554.865v1.142c0 .219-.042.415-.126.588-.084.168-.19.297-.32.387-.137.095-.29.163-.453.201-.185.05-.364.084-.537.101-.18.01-.359.016-.538.017h-.001Z',
        '6': 'M11.992 14.484a6.003 6.003 0 0 1-.613-.025 2.483 2.483 0 0 1-.496-.11 1.24 1.24 0 0 1-.453-.243 1.184 1.184 0 0 1-.286-.437 1.892 1.892 0 0 1-.118-.689v-2.537c0-.268.045-.506.135-.714.095-.212.215-.375.361-.487.123-.095.288-.173.496-.235a2.71 2.71 0 0 1 .604-.126c.213-.011.406-.017.58-.017.24 0 .745.028 1.512.084v.9c-.756-.09-1.296-.135-1.621-.135-.269 0-.46.014-.571.042-.112.028-.188.084-.227.168-.034.078-.05.22-.05.428v.647h.898c.303 0 .521.005.655.017.135.005.286.03.454.075.18.045.31.11.395.193.09.079.168.2.235.362.062.168.092.366.092.596v.74c0 .257-.039.484-.117.68-.079.19-.18.338-.303.445-.112.1-.26.182-.445.243-.173.06-.354.098-.537.11a5.589 5.589 0 0 1-.58.025Zm.017-.815c.246 0 .417-.014.512-.042.101-.028.165-.081.193-.16.034-.14.048-.284.042-.428v-.79c0-.134-.016-.23-.05-.285-.034-.062-.104-.104-.21-.126a2.558 2.558 0 0 0-.496-.034h-.756v1.243c0 .19.014.328.042.412.034.084.101.14.202.168.106.028.281.042.521.042Z',
        '7': 'M12.546 9.906H9.9v-.958h4v.84L11.807 14.4h-1.36l2.1-4.494h-.001Z',
        '8': 'M12 14.484c-.723 0-1.252-.09-1.588-.269-.33-.18-.496-.49-.496-.932v-.941c0-.18.09-.347.269-.504.179-.157.392-.263.638-.32v-.033a.88.88 0 0 1-.504-.235.612.612 0 0 1-.218-.462v-.781c0-.392.143-.68.428-.866.291-.184.781-.277 1.47-.277s1.176.093 1.462.277c.291.185.437.474.437.866v.78a.613.613 0 0 1-.219.463.879.879 0 0 1-.504.235v.034c.247.056.46.162.639.319s.268.325.268.504v.94c0 .454-.17.768-.512.941-.342.174-.865.26-1.57.26v.001Zm0-3.293c.246 0 .416-.034.512-.1.1-.074.15-.188.15-.345v-.63c0-.163-.05-.277-.15-.345-.096-.072-.266-.109-.513-.109-.246 0-.42.037-.52.11-.096.067-.143.181-.143.344v.63a.41.41 0 0 0 .142.336c.09.073.264.11.521.11l.001-.001Zm0 2.495c.24 0 .414-.014.52-.042.112-.028.185-.076.218-.143.04-.067.06-.174.06-.32v-.738c0-.163-.048-.283-.144-.362-.095-.072-.31-.109-.646-.109-.32 0-.535.037-.647.11-.107.067-.16.187-.16.36v.74c0 .145.017.252.05.32.04.066.113.114.219.142.112.028.288.042.53.042Z',
        '9': 'M11.84 14.484c-.48 0-.999-.028-1.553-.084v-.874c.717.079 1.229.118 1.537.118.286 0 .493-.02.622-.059.128-.04.212-.112.252-.218.044-.107.067-.275.067-.504v-.513h-.907c-.303 0-.521-.003-.656-.008a2.629 2.629 0 0 1-.453-.084.897.897 0 0 1-.395-.193 1.051 1.051 0 0 1-.235-.37 1.707 1.707 0 0 1-.093-.588v-.74c0-.257.04-.48.118-.671.078-.196.18-.35.302-.462.112-.095.258-.174.437-.235.185-.062.367-.101.546-.118.213-.011.406-.017.58-.017.263 0 .47.009.621.025.157.012.322.045.496.101a1.129 1.129 0 0 1 .74.689c.081.22.12.454.117.689v2.537c0 .565-.171.971-.513 1.218-.336.24-.879.36-1.63.36v.001Zm.925-2.949V10.26c0-.19-.017-.322-.05-.395-.029-.073-.093-.12-.194-.143a2.73 2.73 0 0 0-.529-.034 2.11 2.11 0 0 0-.504.042.26.26 0 0 0-.193.152c-.034.072-.05.198-.05.378v.831c0 .135.016.233.05.294.033.056.1.095.201.118a2.7 2.7 0 0 0 .504.033h.765v-.001Z',
        '0': 'M13.828 14.484c-.246 0-.448-.009-.604-.025a3.293 3.293 0 0 1-.513-.101 1.236 1.236 0 0 1-.462-.235 1.202 1.202 0 0 1-.294-.454 1.7 1.7 0 0 1-.126-.689v-2.612c0-.258.04-.485.118-.68a1.23 1.23 0 0 1 .302-.463c.107-.095.252-.17.437-.226.18-.06.365-.1.554-.118.213-.011.41-.017.588-.017.252 0 .454.009.605.025.171.016.34.05.504.101.202.062.361.143.479.244.118.1.218.246.302.437.084.19.126.422.126.697v2.612c0 .258-.042.485-.126.68a1.15 1.15 0 0 1-.302.454 1.32 1.32 0 0 1-.462.235c-.19.062-.372.098-.546.11a5.589 5.589 0 0 1-.58.025Zm.017-.79c.235 0 .403-.014.504-.042a.306.306 0 0 0 .202-.176c.033-.084.05-.221.05-.412v-2.78c0-.19-.017-.328-.05-.412a.282.282 0 0 0-.202-.168c-.1-.033-.269-.05-.504-.05-.24 0-.414.017-.52.05a.282.282 0 0 0-.202.168c-.034.084-.05.221-.05.412v2.78c0 .19.016.328.05.412.033.084.1.143.2.176.108.028.28.042.522.042Z'
    };

    const FACEIT_LEVEL_DIGITS = {
        1: ['1'], 2: ['2'], 3: ['3'], 4: ['4'], 5: ['5'],
        6: ['6'], 7: ['7'], 8: ['8'], 9: ['9'], 10: ['1_16', '0']
    };

    function generateFaceitLevelSvg(level, size) {
        const s = size || 24;
        const lvl = Math.min(Math.max(Number(level) || 1, 1), 10);
        const color = FACEIT_LEVEL_COLORS[lvl] || '#ffffff';
        const progressPath = lvl >= 10 ? FACEIT_PROGRESS_PATHS.full : (FACEIT_PROGRESS_PATHS[lvl] || FACEIT_PROGRESS_PATHS.full);
        const digitKeys = FACEIT_LEVEL_DIGITS[lvl] || ['1'];
        const digitsSvg = digitKeys.map(k => `<path fill="${color}" d="${FACEIT_DIGIT_PATHS[k] || ''}"/>`).join('');
        const clipId = `flc_${lvl}_${Math.random().toString(36).substr(2, 5)}`;

        return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="${s}" height="${s}" class="faceit-level-svg faceit-level-${lvl}" style="display:inline-block; vertical-align:middle; flex-shrink:0;">
            <g clip-path="url(#${clipId})">
                <path fill="#111111" d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12Z"/>
                <path fill="#CDCDCD" fill-opacity=".15" fill-rule="evenodd" d="M16.686 17.467a7.2 7.2 0 1 0-9.371 0l-1.563 1.822A9.58 9.58 0 0 1 2.4 12a9.6 9.6 0 1 1 19.2 0 9.58 9.58 0 0 1-3.352 7.29l-1.562-1.823Z" clip-rule="evenodd"/>
                <path fill="${color}" fill-rule="evenodd" d="${progressPath}" clip-rule="evenodd"/>
                ${digitsSvg}
            </g>
            <defs>
                <clipPath id="${clipId}">
                    <path fill="#fff" d="M0 0h24v24H0z"/>
                </clipPath>
            </defs>
        </svg>`;
    }

    function generateChallengerSvg(fillColor, size) {
        const s = size || 24;
        const fill = fillColor || '#FFD336';
        return `<svg viewBox="0 0 24 24" fill="${fill}" xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" class="challenger-official-svg" style="display:inline-block; vertical-align:middle; flex-shrink:0;">
            <title>Challenger rank</title>
            <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12" fill="#121212"></path>
            <path d="M7.042 6.773a10 10 0 00-1.297-.375l-.008-.008c-.15-.442-.255-.885-.352-1.365a9.5 9.5 0 012.1-1.515 10 10 0 00-.023 1.41c.405.21.803.458 1.155.713-.57.307-1.102.69-1.575 1.14m11.213-.375c.15-.443.255-.885.353-1.365a9.5 9.5 0 00-2.1-1.515c.037.487.052.945.022 1.41-.405.21-.795.457-1.155.712a7 7 0 011.575 1.14c.413-.15.855-.285 1.297-.375zM20.85 8.28c-.27.39-.555.758-.87 1.103-.442-.09-.9-.15-1.343-.173a7.2 7.2 0 00-.99-1.672 9 9 0 011.343-.195c.21-.413.383-.84.54-1.298.54.683.982 1.433 1.32 2.235m-.487 4.53a11 11 0 001.237-.667 9.6 9.6 0 00-.308-2.573q-.482.529-1.02.968a9 9 0 00-1.304-.368c.165.63.24 1.283.232 1.935q.587.304 1.163.698zm.36 3.18a10 10 0 01-1.388.113 9 9 0 00-.788-1.11 7 7 0 00.555-1.86c.368.255.728.54 1.05.855a8 8 0 001.32-.48 9.3 9.3 0 01-.75 2.482zm-2.333 3.173c-.458-.12-.9-.278-1.328-.465v.007a8 8 0 00-.27-1.327c.503-.42.908-.938 1.268-1.478.247.39.427.78.615 1.208.45.052.937.104 1.402.09-.48.72-1.027 1.402-1.687 1.965M7.207 17.37a8 8 0 00-.27 1.328v-.008q-.641.284-1.327.465c-.66-.563-1.208-1.245-1.688-1.965.465.015.953-.03 1.403-.09.187-.428.367-.818.615-1.208.36.54.772 1.058 1.267 1.478m-2.535-1.267c.233-.39.51-.773.788-1.11a6.5 6.5 0 01-.555-1.86 8 8 0 00-1.05.855 9 9 0 01-1.32-.48c.12.862.39 1.695.75 2.482.477.067.925.112 1.387.113m.128-3.99c-.382.195-.772.435-1.162.697v.008A13 13 0 012.4 12.15a9.6 9.6 0 01.308-2.572q.482.529 1.02.967c.427-.157.87-.277 1.305-.367a7 7 0 00-.233 1.935m-.78-2.73c.442-.098.9-.15 1.342-.173a7.2 7.2 0 01.99-1.672 10 10 0 00-1.342-.195 10 10 0 01-.54-1.298A9.6 9.6 0 003.15 8.28c.27.398.555.765.87 1.103m9.02 11.536l1.345.52-.27.699L12 21.321l-2.115.817-.27-.7 1.345-.52L7.807 19.7l.27-.7L12 20.517 15.923 19l.27.7zm2.004-12.781c.033-.05.114-.033.114.033v6.76c0 .033-.098.082-.146.066-.663-.26-1.49-.588-2.391-.945a586 586 0 00-6.041-2.37c-.066-.032-.033-.131.048-.131h6.251c.379-.623.8-1.28 1.402-2.22z"></path>
        </svg>`;
    }

    function getChallengerTier(rankText) {
        const num = parseInt(String(rankText).replace(/[^0-9]/g, ''), 10) || 10;
        if (num === 1) {
            return {
                tierClass: 'rank-tier-1',
                holderClass: 'BadgeHolder__FirstRank',
                fill: '#FFD336',
                textColor: '#121212',
                border: '#FFD336',
                glow: 'rgba(255, 211, 54, 0.55)'
            };
        } else if (num === 2) {
            return {
                tierClass: 'rank-tier-2',
                holderClass: 'BadgeHolder__SecondRank',
                fill: '#DEF5FF',
                textColor: '#121212',
                border: '#DEF5FF',
                glow: 'rgba(222, 245, 255, 0.55)'
            };
        } else if (num === 3) {
            return {
                tierClass: 'rank-tier-3',
                holderClass: 'BadgeHolder__ThirdRank',
                fill: '#FF7236',
                textColor: '#ffffff',
                border: '#FF7236',
                glow: 'rgba(255, 114, 54, 0.55)'
            };
        } else {
            return {
                tierClass: 'rank-tier-default',
                holderClass: 'BadgeHolder__DefaultRank',
                fill: '#e80128',
                textColor: '#ffffff',
                border: '#e80128',
                glow: 'rgba(232, 1, 40, 0.55)'
            };
        }
    }

    function setupBadgeVisibility(rankText, skillLevel, isChallenger) {
        const pill = document.getElementById('pswRankPill');
        const standaloneIcon = document.getElementById('pswStandaloneIcon');
        const levelBadge = document.getElementById('pswLevelBadge');
        const pillIcon = document.getElementById('pswPillIcon');

        if (!pill || !standaloneIcon || !levelBadge) return;

        if (isChallenger) {
            const tier = getChallengerTier(rankText);

            pill.classList.remove(
                'rank-tier-1', 'rank-tier-2', 'rank-tier-3', 'rank-tier-default',
                'BadgeHolder__FirstRank', 'BadgeHolder__SecondRank', 'BadgeHolder__ThirdRank', 'BadgeHolder__DefaultRank'
            );
            pill.classList.add(tier.tierClass, tier.holderClass);

            // Update official SVG colors
            const pswPillSvg = document.getElementById('pswPillSvg');
            if (pswPillSvg) pswPillSvg.setAttribute('fill', tier.fill);

            const pswStandaloneSvg = document.getElementById('pswStandaloneSvg');
            if (pswStandaloneSvg) pswStandaloneSvg.setAttribute('fill', tier.fill);

            levelBadge.classList.add('hidden');

            if (showRank && showChallengerIcon) {
                pill.classList.remove('pill-hidden');
                if (pillIcon) pillIcon.style.display = 'inline-flex';
                standaloneIcon.classList.add('hidden');
            } else if (!showRank && showChallengerIcon) {
                pill.classList.add('pill-hidden');
                standaloneIcon.classList.remove('hidden');
            } else if (showRank && !showChallengerIcon) {
                pill.classList.remove('pill-hidden');
                if (pillIcon) pillIcon.style.display = 'none';
                standaloneIcon.classList.add('hidden');
            } else {
                pill.classList.add('pill-hidden');
                standaloneIcon.classList.add('hidden');
            }
        } else {
            // Standard Faceit Level (1-10): Only shown if user hasn't hidden rank/level
            pill.classList.add('pill-hidden');
            standaloneIcon.classList.add('hidden');

            if (showRank || showChallengerIcon) {
                levelBadge.classList.remove('hidden');
                levelBadge.innerHTML = generateFaceitLevelSvg(skillLevel, 24);
            } else {
                levelBadge.classList.add('hidden');
            }
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
        // Layout 1: Compact Cyber
        const elRank = document.getElementById('pswRankNum');
        const elElo = document.getElementById('pswElo');
        const elKdr = document.getElementById('pswKdr');
        const elFlag = document.getElementById('pswFlag');
        const elCountryRank = document.getElementById('pswCountryRank');
        const elHeader = document.getElementById('pswMatchesHeader');
        const elWinrate = document.getElementById('pswWinrate');
        const elKillsAdr = document.getElementById('pswKillsAdr');
        const elKdKr = document.getElementById('pswKdKr');

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

        if (elFlag) elFlag.innerHTML = stats.flagHtml || '';
        setupBadgeVisibility(stats.rank, stats.skillLevel, stats.isChallenger);

        // Layout 2: Pro Wide Banner (media_1790812631607.png & media_1790813500552.png)
        const ppbNick = document.getElementById('ppbNick');
        const ppbElo = document.getElementById('ppbElo');
        const ppbAdr = document.getElementById('ppbAdr');
        const ppbAvg = document.getElementById('ppbAvg');
        const ppbKd = document.getElementById('ppbKd');
        const ppbKr = document.getElementById('ppbKr');
        const ppbEuRank = document.getElementById('ppbEuRank');
        const ppbCountryRank = document.getElementById('ppbCountryRank');
        const ppbCountryFlag = document.getElementById('ppbCountryFlag');
        const ppbStreak = document.getElementById('ppbStreak');
        const ppbEmblem = document.querySelector('.ppb-emblem');
        const ppbEuRankWrap = document.getElementById('ppbEuRankWrap');
        const ppbCountryRankWrap = document.getElementById('ppbCountryRankWrap');

        if (ppbNick && stats.nickname) ppbNick.textContent = stats.nickname;
        if (ppbElo && stats.elo) ppbElo.textContent = stats.elo;
        if (ppbAdr) ppbAdr.textContent = stats.avgAdrOnly || '—';
        if (ppbAvg) ppbAvg.textContent = stats.avgKillsOnly || '—';
        if (ppbKd) ppbKd.textContent = stats.recentKdOnly || '—';
        if (ppbKr) ppbKr.textContent = stats.recentKrOnly || '—';

        // Pro Emblem: Challenger laurel if Challenger, or authentic Faceit Level SVG if standard level
        if (ppbEmblem) {
            if (stats.isChallenger) {
                if (showChallengerIcon) {
                    ppbEmblem.style.display = 'flex';
                    const tier = getChallengerTier(stats.rank);
                    ppbEmblem.innerHTML = generateChallengerSvg(tier.fill, 38);
                } else {
                    ppbEmblem.style.display = 'none';
                }
            } else {
                if (showRank || showChallengerIcon) {
                    ppbEmblem.style.display = 'flex';
                    ppbEmblem.innerHTML = generateFaceitLevelSvg(stats.skillLevel, 38);
                } else {
                    ppbEmblem.style.display = 'none';
                }
            }
        }

        // Pro Ranks: only show EU rank if player is in EU Top 1000 Challenger
        if (ppbEuRankWrap) {
            if (stats.isChallenger && stats.euRank && showRank) {
                ppbEuRankWrap.style.display = 'inline-flex';
                if (ppbEuRank) ppbEuRank.textContent = `Eu: #${stats.euRank}`;
            } else {
                ppbEuRankWrap.style.display = 'none';
            }
        }

        if (ppbCountryRankWrap) {
            if (stats.countryRank && showRank) {
                ppbCountryRankWrap.style.display = 'inline-flex';
                const coPrefix = (stats.countryCode || 'Co').toUpperCase();
                if (ppbCountryRank) ppbCountryRank.textContent = `${coPrefix}: #${stats.countryRank}`;
            } else {
                ppbCountryRankWrap.style.display = 'none';
            }
        }

        if (ppbCountryFlag) ppbCountryFlag.innerHTML = stats.flagHtml || '';

        // Streak W/L HTML
        if (ppbStreak && stats.streakHtml) {
            ppbStreak.innerHTML = stats.streakHtml;
        }
    }

    async function fetchLivePlayerStats(userNick) {
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
        };

        let playerResp;
        try {
            playerResp = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(userNick)}`, { headers });
        } catch (netErr) {
            return {
                rank: '!', elo: 'ERR', nickname: userNick, overallKdr: 'OFFLINE', countryRank: '', euRank: '',
                headerText: 'ПОМИЛКА МЕРЕЖІ З FACEIT', winRate: '—', killsAdr: '— / —', kdKr: '— / —',
                avgAdrOnly: '—', avgKillsOnly: '—', recentKdOnly: '—', recentKrOnly: '—',
                todayWins: 0, todayLosses: 0, todayKillsAdr: '— / —', todayKd: '—',
                streakHtml: '<span class="ppb-l">OFFLINE</span>', flagHtml: ''
            };
        }

        if (!playerResp.ok) {
            return {
                rank: '?', elo: '404', nickname: userNick, overallKdr: '404', countryRank: '', euRank: '',
                headerText: `НІК "${userNick}" НЕ ІСНУЄ НА FACEIT`, winRate: '—', killsAdr: '— / —', kdKr: '— / —',
                avgAdrOnly: '404', avgKillsOnly: '404', recentKdOnly: '—', recentKrOnly: '—',
                todayWins: 0, todayLosses: 0, todayKillsAdr: '— / —', todayKd: '—',
                streakHtml: '<span class="ppb-l">404</span>', flagHtml: ''
            };
        }

        const playerData = await playerResp.json();
        const playerId = playerData.player_id;
        const country = (playerData.country || '').toLowerCase();
        const cs2 = playerData.games?.cs2;

        if (!cs2) {
            return {
                rank: '—', elo: 'NO CS2', nickname: playerData.nickname, overallKdr: '—', countryRank: '', euRank: '',
                headerText: 'CS2 СТАТИСТИКА ВІДСУТНЯ', winRate: '—', killsAdr: '— / —', kdKr: '— / —',
                avgAdrOnly: '—', avgKillsOnly: '—', recentKdOnly: '—', recentKrOnly: '—',
                todayWins: 0, todayLosses: 0, todayKillsAdr: '— / —', todayKd: '—',
                streakHtml: '<span class="ppb-l">NO CS2</span>', flagHtml: getCountryHtml(country)
            };
        }

        const currentElo = cs2.faceit_elo || 0;
        const skillLevel = cs2.skill_level || 10;
        const region = cs2.region || 'EU';

        const [statsData, lifetimeData, countryRankData, regionRankData] = await Promise.all([
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/games/cs2/stats?limit=30`, { headers })
                .then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`https://open.faceit.com/data/v4/players/${playerId}/stats/cs2`, { headers })
                .then(r => r.ok ? r.json() : null).catch(() => null),
            country ? fetch(`https://open.faceit.com/data/v4/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}?country=${encodeURIComponent(country)}`, { headers })
                .then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
            fetch(`https://open.faceit.com/data/v4/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}`, { headers })
                .then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        let countryPosition = countryRankData?.position ? String(countryRankData.position) : '';
        let euPosition = regionRankData?.position ? String(regionRankData.position) : '';

        let rankBadge = `#${skillLevel}`;
        let isChallenger = false;
        if (regionRankData && regionRankData.position && regionRankData.position <= 1000) {
            rankBadge = `#${regionRankData.position}`;
            isChallenger = true;
        }

        let overallKdrText = '— KDR';
        if (lifetimeData && lifetimeData.lifetime && lifetimeData.lifetime['Average K/D Ratio']) {
            overallKdrText = `${lifetimeData.lifetime['Average K/D Ratio']} KDR`;
        }

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
        const avgKills = totalMatches > 0 ? Math.round(totalKills / totalMatches) : 0;
        const avgAdr = countAdr > 0 ? (totalAdr / countAdr).toFixed(1) : (totalMatches > 0 ? '—' : '0');
        const recentKd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);
        const recentKr = totalRounds > 0 ? (totalKills / totalRounds).toFixed(2) : '—';

        if (overallKdrText === '— KDR' && totalDeaths > 0) {
            overallKdrText = `${recentKd} KDR`;
        }

        // Today's Stats
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

        // Recent 5 matches streak (W/L chips)
        const recentStreak = allItems.slice(0, 5).reverse();
        let streakHtml = '';
        if (recentStreak.length > 0) {
            streakHtml = recentStreak.map(m => {
                const isWin = m.stats.Result === '1' || m.stats.Winner === m.stats.Team;
                return isWin ? '<span class="ppb-w">W</span>' : '<span class="ppb-l">L</span>';
            }).join(' ');
        } else {
            streakHtml = '<span class="ppb-w">W</span> <span class="ppb-w">W</span> <span class="ppb-l">L</span>';
        }

        return {
            rank: rankBadge,
            skillLevel: skillLevel,
            isChallenger: isChallenger,
            elo: String(currentElo),
            nickname: playerData.nickname,
            overallKdr: overallKdrText,
            countryRank: countryPosition,
            countryCode: country,
            euRank: isChallenger ? euPosition : '',
            headerText: `LAST ${totalMatches} MATCHES (${playerData.nickname})`,
            winRate: `${winRateNum}%`,
            killsAdr: `${avgKills} / ${avgAdr}`,
            kdKr: `${recentKd} / ${recentKr}`,
            avgAdrOnly: avgAdr !== '—' ? String(Math.round(parseFloat(avgAdr))) : '—',
            avgKillsOnly: String(avgKills),
            recentKdOnly: String(recentKd),
            recentKrOnly: String(recentKr),
            todayWins: todayWins,
            todayLosses: todayLosses,
            todayKillsAdr: `${todayAvgKills}/${todayAvgAdr}`,
            todayKd: String(todayKd),
            streakHtml: streakHtml,
            flagHtml: getCountryHtml(country)
        };
    }

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

        // Cycle mode
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
                nickname: 'FACEIT',
                overallKdr: 'PULSE',
                countryRank: '',
                euRank: '',
                headerText: 'ВКАЖІТЬ ?nickname=ВАШ_НІК У URL',
                winRate: '—',
                killsAdr: '— / —',
                kdKr: '— / —',
                avgAdrOnly: '—',
                avgKillsOnly: '—',
                recentKdOnly: '—',
                recentKrOnly: '—',
                todayWins: 0,
                todayLosses: 0,
                todayKillsAdr: '0/0',
                todayKd: '0',
                streakHtml: '<span class="ppb-w">W</span> <span class="ppb-l">L</span>',
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

        setInterval(update, 45000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
