// Generar manifest dinámicamente
const manifestData = {
    "name": "Pádel Americano",
    "short_name": "Pádel",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#f4f7fc",
    "theme_color": "#6a11cb",
    "icons": [
        {
            "src": "https://padel.random.biz/wp-content/uploads/2025/05/Padel-Logo-1.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "https://padel.random.biz/wp-content/uploads/2025/05/Padel-Logo-1.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
};

const manifestBlob = new Blob([JSON.stringify(manifestData)], {type: 'application/json'});
const manifestURL = URL.createObjectURL(manifestBlob);
const manifestPlaceholder = document.getElementById('manifest-placeholder');
if (manifestPlaceholder) {
    manifestPlaceholder.href = manifestURL;
}

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        const swCode = `
            const CACHE_NAME = 'padel-americano-v11';
            const urlsToCache = ['/', 'index.html', 'style.css', 'script.js'];

            self.addEventListener('install', e => {
                e.waitUntil(
                    caches.open(CACHE_NAME).then(c => {
                        return c.addAll(urlsToCache).then(() => self.skipWaiting());
                    })
                );
            });

            self.addEventListener('activate', event => {
                event.waitUntil(clients.claim());
                event.waitUntil(
                    caches.keys().then(cacheNames => {
                        return Promise.all(
                            cacheNames.filter(cacheName => {
                                return cacheName.startsWith('padel-americano-') && cacheName !== CACHE_NAME;
                            }).map(cacheName => {
                                return caches.delete(cacheName);
                            })
                        );
                    })
                );
            });

            self.addEventListener('fetch', e => {
                e.respondWith(
                    caches.match(e.request).then(response => {
                        return response || fetch(e.request);
                    })
                );
            });
        `;
        const blob = new Blob([swCode], { type: 'application/javascript' });
        const swUrl = URL.createObjectURL(blob);
        navigator.serviceWorker.register(swUrl).then(() => console.log('ServiceWorker registrado')).catch(err => console.log('ServiceWorker falló', err));
    });
}

// PWA Install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installPrompt = document.getElementById('install-prompt');
    if (installPrompt && localStorage.getItem('installDismissed') !== 'true') {
        installPrompt.style.display = 'block';
    }
});

function installApp() {
    const installPrompt = document.getElementById('install-prompt');
    if(installPrompt) installPrompt.style.display = 'none';
    if (deferredPrompt) deferredPrompt.prompt();
}

function dismissInstall() {
    const installPrompt = document.getElementById('install-prompt');
    if(installPrompt) installPrompt.style.display = 'none';
    localStorage.setItem('installDismissed', 'true');
}

class PadelAmericano {
    constructor() {
        this.stage = 'setup';
        this.players = ['', '', '', ''];
        this.playerPool = [];
        this.numCourts = 1;
        this.rounds = [];
        this.currentRound = 0;
        this.leaderboard = [];
        this.restsByRound = [];
        this.timerMinutes = 10;
        this.timerSeconds = 600;
        this.timerInterval = null;
        this.isTimerRunning = false;
        this.init();
    }

    init() {
        this.loadState();
        this.loadPlayerPool();
        this.render();
    }

    saveState() {
        try {
            const state = {
                stage: this.stage,
                players: this.players,
                numCourts: this.numCourts,
                rounds: this.rounds,
                currentRound: this.currentRound,
                leaderboard: this.leaderboard,
                restsByRound: this.restsByRound,
                timerMinutes: this.timerMinutes,
            };
            localStorage.setItem('padelState', JSON.stringify(state));
        } catch (e) {
            console.error('No se pudo guardar el estado');
        }
    }

    loadState() {
        try {
            const state = JSON.parse(localStorage.getItem('padelState'));
            if (state) {
                this.stage = state.stage || 'setup';
                this.players = state.players || ['', '', '', ''];
                this.numCourts = state.numCourts || 1;
                this.rounds = state.rounds || [];
                this.currentRound = state.currentRound || 0;
                this.leaderboard = state.leaderboard || [];
                this.restsByRound = state.restsByRound || [];
                this.timerMinutes = state.timerMinutes || 10;
                this.timerSeconds = this.timerMinutes * 60;
            }
        } catch (e) {
            console.error('No se pudo cargar el estado');
        }
    }

    savePlayerPool() {
        try {
            localStorage.setItem('padelPlayerPool', JSON.stringify(this.playerPool));
        } catch (e) {
            console.error('No se pudo guardar la lista de jugadores');
        }
    }

    loadPlayerPool() {
        try {
            const pool = JSON.parse(localStorage.getItem('padelPlayerPool'));
            if (pool && Array.isArray(pool)) {
                this.playerPool = pool;
            }
        } catch (e) {
            console.error('No se pudo cargar la lista de jugadores');
        }
    }

    addPlayerToPool() {
        const input = document.getElementById('new-pool-player-name');
        if (!input || !input.value.trim()) return;
        const name = input.value.trim();
        if (!this.playerPool.includes(name)) {
            this.playerPool.push(name);
            this.playerPool.sort();
            this.savePlayerPool();
            this.renderPlayerPoolManager(); // Re-render the manager modal
        }
        input.value = '';
    }

    removePlayerFromPool(name) {
        this.playerPool = this.playerPool.filter(p => p !== name);
        this.savePlayerPool();
        this.renderPlayerPoolManager(); // Re-render the manager modal
    }

    loadPlayersFromSelection() {
        const selectedPlayers = [];
        this.playerPool.forEach(player => {
            const checkbox = document.getElementById(`pool-player-${player}`);
            if (checkbox && checkbox.checked) {
                selectedPlayers.push(player);
            }
        });
        if (selectedPlayers.length > 0) {
            this.players = selectedPlayers;
            while (this.players.length < 4) {
                this.players.push('');
            }
            this.closeModal();
            this.render();
        }
    }

    addPlayerMidGame() {
        const input = document.getElementById('new-mid-game-player-name');
        if (!input || !input.value.trim()) return;
        const name = input.value.trim();

        const confirmation = confirm(
            `Al añadir a '${name}', el calendario de rondas futuras se recalculará para incluirle. ` +
            `Esto puede causar que algunos jugadores repitan pareja. ¿Continuar?`
        );

        if (confirmation) {
            this.players.push(name);
            if (!this.playerPool.includes(name)) {
                this.playerPool.push(name);
                this.playerPool.sort();
                this.savePlayerPool();
            }

            const { rounds: newSchedule, restsByRound: newRests } = this.generateTournament(this.players, this.numCourts);

            this.rounds.splice(this.currentRound + 1, Infinity, ...newSchedule.slice(this.currentRound + 1));
            this.restsByRound.splice(this.currentRound + 1, Infinity, ...newRests.slice(this.currentRound + 1));

            this.closeModal();
            this.saveState();
            this.render();
        }
    }

    updateTimerMinutes(minutes) {
        if (!this.isTimerRunning) {
            this.timerMinutes = parseInt(minutes) || 10;
            this.timerSeconds = this.timerMinutes * 60;
            this.saveState();
            this.render();
        }
    }

    resetTimer() {
        this.stopTimer();
        this.timerSeconds = this.timerMinutes * 60;
        this.isTimerRunning = false;
        this.render();
    }

    startTimer() {
        if (this.isTimerRunning) return;
        this.isTimerRunning = true;
        this.timerInterval = setInterval(() => {
            if (this.timerSeconds > 0) {
                this.timerSeconds--;
                this.renderTimer();
            } else {
                this.timerFinished();
            }
        }, 1000);
        this.render();
    }

    pauseTimer() {
        this.isTimerRunning = false;
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.render();
    }

    stopTimer() {
        this.isTimerRunning = false;
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    timerFinished() {
        this.stopTimer();
        if ('vibrate' in navigator) navigator.vibrate([500, 200, 500]);
        this.render();
    }

    formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    addPlayer() {
        this.players.push('');
        this.adjustCourtsForPlayers();
        this.saveState();
        this.render();
    }

    removePlayer(index) {
        if (this.players.length > 4) {
            this.players.splice(index, 1);
            this.adjustCourtsForPlayers();
            this.saveState();
            this.render();
        }
    }

    updatePlayer(index, name) {
        this.players[index] = name;
        this.saveState();
        if (this.stage === 'setup') {
            this.render();
        }
    }

    updateCourts(value) {
        this.numCourts = parseInt(value) || 1;
        this.saveState();
        this.render();
    }

    adjustCourtsForPlayers() {
        const validCount = this.players.filter(p => p.trim() !== '').length;
        if (validCount < 8 && this.numCourts !== 1) {
            this.numCourts = 1;
        }
    }

    generateCompleteSchedule(players) {
        let n = players.length;
        const working = [...players];
        if (n % 2 === 1) {
            working.push('GHOST');
            n++;
        }
        const rounds = [];
        for (let r = 0; r < n - 1; r++) {
            const roundPairs = [];
            for (let i = 0; i < n / 2; i++) {
                const p1 = working[i];
                const p2 = working[n - 1 - i];
                if (p1 !== 'GHOST' && p2 !== 'GHOST') roundPairs.push([p1, p2]);
            }
            working.splice(1, 0, working.pop());
            rounds.push(roundPairs);
        }
        return rounds;
    }

    generateTournament(playerList, courts) {
        const validPlayers = playerList.map(p => p.trim()).filter(Boolean);
        const n = validPlayers.length;
        if (n < 4) return { rounds: [], restsByRound: [] };

        const schedule = this.generateCompleteSchedule(validPlayers);
        const allRounds = [];
        const rests = [];

        for (const roundPairs of schedule) {
            const roundMatches = [];
            const availablePairs = [...roundPairs];
            const playingInRound = new Set();

            for (let court = 1; court <= courts; court++) {
                if (availablePairs.length < 2) break;
                const matchPairs = availablePairs.splice(0, 2);
                const team1 = matchPairs[0];
                const team2 = matchPairs[1];
                roundMatches.push({ team1, team2, court, score1: '', score2: '', finished: false });
                [...team1, ...team2].forEach(p => playingInRound.add(p));
            }
            allRounds.push(roundMatches);
            const resting = validPlayers.filter(p => !playingInRound.has(p));
            rests.push(resting);
        }
        return { rounds: allRounds, restsByRound: rests };
    }

    startTournament() {
        const validPlayers = this.players.filter(p => p.trim() !== '');
        if (validPlayers.length < 4) {
            alert("Necesitas al menos 4 jugadores.");
            return;
        }
        const { rounds, restsByRound } = this.generateTournament(validPlayers, this.numCourts);
        this.rounds = rounds;
        this.restsByRound = restsByRound;
        this.currentRound = 0;
        this.stage = 'playing';
        this.resetTimer();
        this.saveState();
        this.render();
    }

    updateScore(matchIndex, team, score) {
        this.rounds[this.currentRound][matchIndex][`score${team}`] = score;
        this.saveState();
        this.render();
    }

    finishMatch(matchIndex) {
        const match = this.rounds[this.currentRound][matchIndex];
        if (match.score1 !== '' && match.score2 !== '') {
            match.finished = true;
            this.calculateLeaderboard();
            this.saveState();
            this.render();
        }
    }

    reopenMatch(matchIndex) {
        this.rounds[this.currentRound][matchIndex].finished = false;
        this.calculateLeaderboard();
        this.saveState();
        this.render();
    }

    calculateLeaderboard() {
        const playerStats = {};
        this.players.filter(p => p.trim()).forEach(p => {
            playerStats[p.trim()] = { name: p.trim(), wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
        });

        this.rounds.forEach(round => {
            round.forEach(match => {
                if (match.finished) {
                    const score1 = parseInt(match.score1) || 0;
                    const score2 = parseInt(match.score2) || 0;
                    const team1Won = score1 > score2;

                    match.team1.forEach(p => {
                        if(playerStats[p]) {
                            playerStats[p].pointsFor += score1;
                            playerStats[p].pointsAgainst += score2;
                            if (team1Won) playerStats[p].wins++; else playerStats[p].losses++;
                        }
                    });
                    match.team2.forEach(p => {
                        if(playerStats[p]) {
                            playerStats[p].pointsFor += score2;
                            playerStats[p].pointsAgainst += score1;
                            if (!team1Won) playerStats[p].wins++; else playerStats[p].losses++;
                        }
                    });
                }
            });
        });

        const sortedPlayers = Object.values(playerStats)
            .map(p => ({ ...p, pointDifference: p.pointsFor - p.pointsAgainst }))
            .sort((a, b) => b.wins - a.wins || b.pointDifference - a.pointDifference || b.pointsFor - a.pointsFor);

        let rank = 1;
        this.leaderboard = sortedPlayers.map((player, index) => {
            if (index > 0) {
                const prev = sortedPlayers[index - 1];
                if (player.wins !== prev.wins || player.pointDifference !== prev.pointDifference || player.pointsFor !== prev.pointsFor) {
                    rank++;
                }
            }
            return { ...player, rank };
        });
    }

    nextRound() {
        if (this.currentRound < this.rounds.length - 1) {
            this.currentRound++;
            this.resetTimer();
            this.saveState();
            this.render();
        }
    }

    prevRound() {
        if (this.currentRound > 0) {
            this.currentRound--;
            this.resetTimer();
            this.saveState();
            this.render();
        }
    }

    finishTournament() {
        this.calculateLeaderboard();
        this.stage = 'finished';
        this.stopTimer();
        this.saveState();
        this.render();
    }

    playAgain() {
        const { rounds, restsByRound } = this.generateTournament(this.players, this.numCourts);
        this.rounds = rounds;
        this.restsByRound = restsByRound;
        this.stage = 'playing';
        this.currentRound = 0;
        this.leaderboard = [];
        this.resetTimer();
        this.saveState();
        this.render();
    }

    newTournament() {
        this.stage = 'setup';
        this.players = ['', '', '', ''];
        this.numCourts = 1;
        this.rounds = [];
        this.currentRound = 0;
        this.leaderboard = [];
        this.timerMinutes = 10;
        this.resetTimer();
        this.saveState();
        this.render();
    }

    exportResults() {
        if (!this.leaderboard.length) return;

        const header = "🏆 Resultados del Torneo 🏆";
        const columns = "Pos | Jugador | G | P | PF | PC | +/-";
        const separator = "-----------------------------------------";

        const rows = this.leaderboard.map(p => {
            const rank = this.getRankIcon(p.rank);
            const diff = p.pointDifference > 0 ? `+${p.pointDifference}` : p.pointDifference;
            return `${rank} | ${p.name} | ${p.wins} | ${p.losses} | ${p.pointsFor} | ${p.pointsAgainst} | ${diff}`;
        }).join('\n');

        const text = `${header}\n\n${columns}\n${separator}\n${rows}`;

        navigator.clipboard.writeText(text).then(() => {
            alert('¡Resultados copiados al portapapeles!');
        }).catch(err => {
            console.error('Error al copiar los resultados: ', err);
            alert('Error al copiar. Revisa la consola para más detalles.');
        });
    }

    getRankIcon(rank) {
        if (rank === 1) return '👑';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    }

    render() {
        const app = document.getElementById('padel-americano-app');
        app.innerHTML = ''; // Clear previous content
        if (this.stage === 'setup') this.renderSetup(app);
        else if (this.stage === 'playing') this.renderPlaying(app);
        else if (this.stage === 'finished') this.renderFinished(app);
    }

    renderModal(content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="modal-close" onclick="padelApp.closeModal()">&times;</span>
                ${content}
            </div>
        `;
        document.body.appendChild(modal);
    }

    closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.remove();
        }
    }

    renderPlayerPoolManager() {
        const content = `
            <h2 style="font-weight: 600; margin-bottom: 16px;">Administrar Jugadores</h2>
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                <input type="text" id="new-pool-player-name" class="padel-input" placeholder="Nombre del nuevo jugador">
                <button class="padel-button btn-primary" onclick="padelApp.addPlayerToPool()">Añadir</button>
            </div>
            <div id="player-pool-list" style="max-height: 300px; overflow-y: auto;">
                ${this.playerPool.map(player => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid var(--light-gray);">
                        <span>${player}</span>
                        <button class="padel-button" style="background: transparent; color: var(--red);" onclick="padelApp.removePlayerFromPool('${player}')">✕</button>
                    </div>
                `).join('') || '<p>No hay jugadores en la lista.</p>'}
            </div>
        `;
        const modal = document.querySelector('.modal .modal-content');
        if (modal) {
            modal.innerHTML = `<span class="modal-close" onclick="padelApp.closeModal()">&times;</span>${content}`;
        } else {
            this.renderModal(content);
        }
    }

    renderPlayerLoader() {
        const content = `
            <h2 style="font-weight: 600; margin-bottom: 16px;">Cargar Jugadores</h2>
            <div id="player-loader-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
                ${this.playerPool.map(player => `
                    <div style="padding: 8px; border-bottom: 1px solid var(--light-gray);">
                        <label style="display: flex; align-items: center; gap: 8px; width: 100%;">
                            <input type="checkbox" id="pool-player-${player}" style="width: 20px; height: 20px;">
                            <span>${player}</span>
                        </label>
                    </div>
                `).join('') || '<p>No hay jugadores para cargar.</p>'}
            </div>
            <button class="padel-button btn-primary" style="width: 100%;" onclick="padelApp.loadPlayersFromSelection()">Cargar Jugadores Seleccionados</button>
        `;
        this.renderModal(content);
    }

    renderMidGamePlayerAdder() {
        const content = `
            <h2 style="font-weight: 600; margin-bottom: 16px;">Añadir Jugador a Torneo</h2>
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                <input type="text" id="new-mid-game-player-name" class="padel-input" placeholder="Nombre del nuevo jugador">
                <button class="padel-button btn-primary" onclick="padelApp.addPlayerMidGame()">Añadir</button>
            </div>
            <p style="font-size: 0.9rem; color: var(--gray);">Nota: El calendario de rondas futuras se recalculará para incluir al nuevo jugador.</p>
        `;
        this.renderModal(content);
    }

    renderSetup(app) {
        const validCount = this.players.filter(p => p.trim() !== '').length;
        const canStart = validCount >= 4;

        const playerInputs = this.players.map((player, index) => {
            const removeButton = this.players.length > 4 ? `<button class="padel-button" style="background: transparent; color: var(--red);" onclick="padelApp.removePlayer(${index})">✕</button>` : '';
            return `<div style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <input type="text" value="${player}" placeholder="Jugador ${index + 1}" class="padel-input" onchange="padelApp.updatePlayer(${index}, this.value)">
                        ${removeButton}
                    </div>`;
        }).join('');

        const courtOptions = `
            <option value="1" ${this.numCourts == 1 ? 'selected' : ''}>1 Cancha</option>
            ${validCount >= 8 ? `<option value="2" ${this.numCourts == 2 ? 'selected' : ''}>2 Canchas</option>` : ''}
        `;

        const courtMessage = validCount < 8 ? '<small style="color: var(--gray); display: block; margin-top: 4px;">Se necesita un mínimo de 8 jugadores para usar 2 canchas.</small>' : '';

        app.innerHTML = `
            <div class="padel-container">
                <div class="text-center">
                    <h1 class="padel-title">Pádel Americano</h1>
                    <p class="padel-subtitle">Configura tu torneo y empieza a jugar</p>
                </div>

                <div class="grid-2">
                    <div class="padel-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                            <h2 style="font-weight: 600; margin: 0;">👥 Jugadores (${validCount})</h2>
                            <div style="display: flex; gap: 8px;">
                                <button class="padel-button btn-secondary" onclick="padelApp.renderPlayerLoader()">Cargar</button>
                                <button class="padel-button btn-secondary" onclick="padelApp.renderPlayerPoolManager()">Editar Lista</button>
                            </div>
                        </div>
                        <div id="player-list" style="margin-bottom: 16px;">
                            ${playerInputs}
                        </div>
                        <button class="padel-button btn-secondary" style="width: 100%;" onclick="padelApp.addPlayer()">+ Añadir Fila</button>
                    </div>

                    <div class="padel-card">
                        <h2 style="font-weight: 600; margin-bottom: 16px;">⚙️ Configuración</h2>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-weight: 600; margin-bottom: 8px;">Nº de Canchas</label>
                            <select class="padel-input" onchange="padelApp.updateCourts(this.value)" ${validCount < 8 ? 'disabled' : ''}>
                                ${courtOptions}
                            </select>
                            ${courtMessage}
                        </div>
                        <button class="padel-button btn-primary" style="width: 100%;" onclick="padelApp.startTournament()" ${!canStart ? 'disabled' : ''}>Iniciar Torneo</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderTimer() {
        const timerEl = document.getElementById('timer-display');
        if (timerEl) timerEl.textContent = this.formatTime(this.timerSeconds);

        const lastMinuteWarning = document.getElementById('last-minute-warning');
        if(lastMinuteWarning) {
            lastMinuteWarning.style.display = (this.timerSeconds <= 60 && this.timerSeconds > 0) ? 'block' : 'none';
        }
        
        const timeUpWarning = document.getElementById('time-up-warning');
        if(timeUpWarning) {
            timeUpWarning.style.display = this.timerSeconds === 0 ? 'block' : 'none';
        }
    }

    renderPlaying(app) {
        const currentMatches = this.rounds[this.currentRound] || [];
        const restingPlayers = this.restsByRound[this.currentRound] || [];

        const matchesHtml = currentMatches.map((match, index) => `
            <div class="padel-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="font-weight: 600;">Cancha ${match.court}</h3>
                    ${match.finished ? '<span style="background: var(--green); color: var(--white); padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">✓ Terminado</span>' : ''}
                </div>
                <div class="team-area">
                    <div class="team-names">${match.team1.join(' & ')}</div>
                    <input type="number" class="score-input" value="${match.score1}" oninput="padelApp.updateScore(${index}, 1, this.value)" onchange="padelApp.updateScore(${index}, 1, this.value)" ${match.finished ? 'disabled' : ''}>
                    <div class="vs-badge">VS</div>
                    <input type="number" class="score-input" value="${match.score2}" oninput="padelApp.updateScore(${index}, 2, this.value)" onchange="padelApp.updateScore(${index}, 2, this.value)" ${match.finished ? 'disabled' : ''}>
                    <div class="team-names">${match.team2.join(' & ')}</div>
                </div>
                <div class="text-center" style="margin-top: 16px;">
                    ${match.finished ? `<button class="padel-button btn-secondary" onclick="padelApp.reopenMatch(${index})">✏️ Editar</button>` : `<button class="padel-button btn-primary" onclick="padelApp.finishMatch(${index})" ${match.score1 === '' || match.score2 === '' ? 'disabled' : ''}>✓ Finalizar Partido</button>`}
                </div>
            </div>
        `).join('');

        const leaderboardHtml = this.leaderboard.length > 0 ? `
            <div class="padel-card">
                <h2 class="text-center" style="font-weight: 600; margin-bottom: 16px;">🏆 Clasificación</h2>
                <table class="leaderboard-table">
                    <thead><tr><th>Pos</th><th>Jugador</th><th>G</th><th>P</th><th>+/-</th></tr></thead>
                    <tbody>
                        ${this.leaderboard.map(p => `
                            <tr>
                                <td><span class="rank-${p.rank}">${this.getRankIcon(p.rank)}</span></td>
                                <td style="font-weight: 600;">${p.name}</td>
                                <td style="color: var(--green);">${p.wins}</td>
                                <td style="color: var(--red);">${p.losses}</td>
                                <td style="font-weight: 600; color: ${p.pointDifference >= 0 ? 'var(--green)' : 'var(--red)'};">${p.pointDifference > 0 ? '+' : ''}${p.pointDifference}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '';

        app.innerHTML = `
            <div class="padel-container">
                <div class="text-center">
                    <h1 class="padel-title">Ronda ${this.currentRound + 1} / ${this.rounds.length}</h1>
                </div>

                <div class="padel-card">
                    <h3 style="text-align: center; font-weight: 600; margin-bottom: 16px;">⏱️ Timer</h3>
                    <div id="timer-display" style="font-size: 3rem; font-weight: 700; text-align: center; font-family: monospace; color: ${this.timerSeconds <= 60 ? 'var(--red)' : 'var(--primary)'};">${this.formatTime(this.timerSeconds)}</div>
                    <div id="last-minute-warning" style="color:var(--red); font-weight:bold; text-align:center; display: none;">¡Último minuto!</div>
                    <div id="time-up-warning" style="color:var(--red); font-weight:bold; text-align:center; display: none;">¡Tiempo terminado!</div>
                    <div class="flex-center" style="margin-top: 16px;">
                        ${!this.isTimerRunning ? `<button class="padel-button btn-primary" onclick="padelApp.startTimer()">▶️ Iniciar</button>` : `<button class="padel-button btn-danger" onclick="padelApp.pauseTimer()">⏸️ Pausar</button>`}
                        <button class="padel-button btn-secondary" onclick="padelApp.resetTimer()">🔄 Reiniciar</button>
                    </div>
                </div>

                <div class="flex-center" style="margin: 24px 0;">
                    <button class="padel-button btn-secondary" onclick="padelApp.prevRound()" ${this.currentRound === 0 ? 'disabled' : ''}>← Ronda Anterior</button>
                    <button class="padel-button" onclick="padelApp.renderMidGamePlayerAdder()">+ Añadir Jugador</button>
                    <button class="padel-button btn-secondary" onclick="padelApp.nextRound()" ${this.currentRound === this.rounds.length - 1 ? 'disabled' : ''}>Siguiente Ronda →</button>
                </div>

                ${restingPlayers.length > 0 ? `<div class="padel-card text-center" style="border-left: 4px solid var(--gold);">💤 Descansan: <strong>${restingPlayers.join(', ')}</strong></div>` : ''}

                ${matchesHtml}

                ${leaderboardHtml}

                <div class="text-center" style="margin-top: 24px;">
                    <button class="padel-button btn-danger" onclick="padelApp.finishTournament()">Finalizar Torneo</button>
                </div>
            </div>
        `;
    }

    renderFinished(app) {
        const first = this.leaderboard.filter(p => p.rank === 1);
        const second = this.leaderboard.filter(p => p.rank === 2);
        const third = this.leaderboard.filter(p => p.rank === 3);

        const podiumHtml = `
            <div class="podium">
                ${second.length > 0 ? `<div class="podium-place second"><div>🥈</div><h3>${second.map(p => p.name).join(' & ')}</h3><p>${second[0].wins} victorias</p></div>` : ''}
                ${first.length > 0 ? `<div class="podium-place first"><div>👑</div><h3>${first.map(p => p.name).join(' & ')}</h3><p>${first[0].wins} victorias</p></div>` : ''}
                ${third.length > 0 ? `<div class="podium-place third"><div>🥉</div><h3>${third.map(p => p.name).join(' & ')}</h3><p>${third[0].wins} victorias</p></div>` : ''}
            </div>
        `;

        const leaderboardHtml = this.leaderboard.map(p => `
            <tr>
                <td><span class="rank-${p.rank}">${this.getRankIcon(p.rank)}</span></td>
                <td style="font-weight: 600;">${p.name}</td>
                <td style="color: var(--green);">${p.wins}</td>
                <td style="color: var(--red);">${p.losses}</td>
                <td>${p.pointsFor}</td>
                <td>${p.pointsAgainst}</td>
                <td style="font-weight: 600; color: ${p.pointDifference >= 0 ? 'var(--green)' : 'var(--red)'};">${p.pointDifference > 0 ? '+' : ''}${p.pointDifference}</td>
            </tr>
        `).join('');

        app.innerHTML = `
            <div class="padel-container">
                <div class="text-center">
                    <h1 class="padel-title">¡Torneo Finalizado!</h1>
                    <p class="padel-subtitle">Resultados finales</p>
                </div>

                ${podiumHtml}

                <div class="padel-card">
                    <h2 class="text-center" style="font-weight: 600; margin-bottom: 16px;">📊 Clasificación Final</h2>
                    <table class="leaderboard-table">
                        <thead><tr><th>Pos</th><th>Jugador</th><th>G</th><th>P</th><th>P.F</th><th>P.C</th><th>+/-</th></tr></thead>
                        <tbody>
                            ${leaderboardHtml}
                        </tbody>
                    </table>
                </div>

                <div class="flex-center" style="margin-top: 24px;">
                    <button class="padel-button btn-secondary" onclick="padelApp.playAgain()">🔄 Jugar Otra Vez</button>
                    <button class="padel-button btn-primary" onclick="padelApp.newTournament()">+ Nuevo Torneo</button>
                    <button class="padel-button" style="background-color: var(--green); color: var(--white);" onclick="padelApp.exportResults()">📋 Exportar Resultados</button>
                </div>
            </div>
        `;
    }
}

let padelApp;
document.addEventListener('DOMContentLoaded', () => {
    padelApp = new PadelAmericano();
    window.padelApp = padelApp;
    window.installApp = installApp;
    window.dismissInstall = dismissInstall;
});
