document.addEventListener('DOMContentLoaded', () => {
    // 1. Elemento do Container do Player capturado
    const playerFooter = document.querySelector('.player');

    const audioPlayer = document.getElementById('audio-player');
    const mainPlayBtn = document.getElementById('main-play-btn');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const playButtons = document.querySelectorAll('.btn-play-stream');
    const prevBtn = document.querySelector('.btn-step:first-child');
    const nextBtn = document.querySelector('.btn-step:last-child');

    // Elementos da Barra de Tempo
    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const totalDurationEl = document.getElementById('total-duration');

    let playlist = [];
    let currentIndex = -1;
    let currentTrack = null;

    const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"></path></svg>';
    const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1"></rect><rect x="13.5" y="5" width="3.5" height="14" rx="1"></rect></svg>';

    function setPlayButtonState(isPlaying) {
        if (!mainPlayBtn) return;

        mainPlayBtn.innerHTML = isPlaying ? pauseIcon : playIcon;
        mainPlayBtn.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproduzir');
    }

    // Função para formatar segundos em mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Mapeia todas as músicas da busca para a fila
    playButtons.forEach((button, index) => {
        const trackData = {
            id: button.getAttribute('data-track-id'),
            url: button.getAttribute('data-url'),
            title: button.getAttribute('data-title'),
            artist: button.getAttribute('data-artist'),
            artwork: button.getAttribute('data-artwork')
        };
        playlist.push(trackData);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            playTrack(index);
        });
    });

    document.querySelectorAll('.track-title-play, .card-artwork').forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            if (event.target.closest('.btn-play-stream')) return;

            const playButton = trigger.closest('.track-card')?.querySelector('.btn-play-stream');
            playButton?.click();
        });
    });

    function playTrack(index) {
        if (index < 0 || index >= playlist.length) return;

        currentIndex = index;
        const track = playlist[currentIndex];
        currentTrack = track;

        if (track && audioPlayer) {
            audioPlayer.src = track.url;
            audioPlayer.play();

            if (playerTitle) playerTitle.textContent = track.title;
            if (playerArtist) playerArtist.textContent = track.artist;
            setPlayButtonState(true);
            updateLikeState(track.id);
        }
    }

    if (audioPlayer) {
        audioPlayer.addEventListener('play', () => {
            if (playerFooter) playerFooter.classList.remove('hidden');
            setPlayButtonState(true);
        });

        audioPlayer.addEventListener('pause', () => setPlayButtonState(false));
    }

    // Atualiza a barra de progresso e tempos durante a reprodução
    if (audioPlayer && progressBar) {
        audioPlayer.addEventListener('timeupdate', () => {
            if (audioPlayer.duration) {
                const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
                progressBar.value = progressPercent;

                // Preenchimento com a cor elegante #3b4252
                progressBar.style.background = `linear-gradient(to right, #3b4252 ${progressPercent}%, #404040 ${progressPercent}%)`;

                if (currentTimeEl) currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
            }
        });

        audioPlayer.addEventListener('loadedmetadata', () => {
            if (totalDurationEl) totalDurationEl.textContent = formatTime(audioPlayer.duration);
        });

        // Permite ao usuário clicar/arrastar na barra para alterar o tempo
        progressBar.addEventListener('input', () => {
            if (audioPlayer.duration) {
                const seekTime = (progressBar.value / 100) * audioPlayer.duration;
                audioPlayer.currentTime = seekTime;
            }
        });
    }

    // Avançar
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (playlist.length === 0) return;
            const nextIndex = (currentIndex + 1) % playlist.length;
            playTrack(nextIndex);
        });
    }

    // Voltar
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (playlist.length === 0) return;
            if (audioPlayer.currentTime > 3) {
                audioPlayer.currentTime = 0;
            } else {
                const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
                playTrack(prevIndex);
            }
        });
    }

    // Tocar Próxima Automática ao Terminar
    if (audioPlayer) {
        audioPlayer.addEventListener('ended', () => {
            if (playlist.length > 0) {
                const nextIndex = (currentIndex + 1) % playlist.length;
                playTrack(nextIndex);
            }
        });
    }

    // Play/Pause central
    if (mainPlayBtn && audioPlayer) {
        mainPlayBtn.addEventListener('click', () => {
            if (!audioPlayer.src) return;

            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        });
    }

    async function updateLikeState(trackId) {
        if (!likeButtons.length || !trackId) return;
        try {
            const response = await fetch(`/api/curtidas/${encodeURIComponent(trackId)}`);
            const data = await response.json();
            likeButtons.forEach(btn => btn.classList.toggle('active', data.curtida));
        } catch (error) {
            console.error('Não foi possível carregar a curtida:', error);
        }
    }

    // Curtir a faixa atual e manter a biblioteca sincronizada
    const likeButtons = document.querySelectorAll('.btn-like');
    likeButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentTrack) return;
            const liked = btn.classList.contains('active');
            try {
                const response = await fetch(`/api/curtidas/${encodeURIComponent(currentTrack.id)}`, {
                    method: liked ? 'DELETE' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: liked ? undefined : JSON.stringify({
                        titulo: currentTrack.title,
                        artista: currentTrack.artist,
                        url_audio: currentTrack.url,
                        capa_url: currentTrack.artwork
                    })
                });
                if (!response.ok) throw new Error('Falha ao salvar a curtida');
                btn.classList.toggle('active', !liked);
            } catch (error) {
                console.error('Não foi possível salvar a curtida:', error);
            }
        });
    });
});