import random

import requests
from flask import flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user
from werkzeug.security import check_password_hash, generate_password_hash

from models import Curtida, Usuario, db


def obter_musicas_aleatorias(limit=12):
    termos = ['rock', 'pop', 'jazz', 'lofi', 'electronic', 'hip hop', 'indie', 'soul', 'house', 'ambient']
    resultados = []
    ids_vistos = set()

    for _ in range(8):
        termo = random.choice(termos)
        url = f'https://discoveryprovider.audius.co/v1/tracks/search?query={termo}&app_name=MUSICSTREAM'

        try:
            resposta = requests.get(url, timeout=8)
            if resposta.status_code != 200:
                continue

            dados = resposta.json().get('data', [])
            for musica in dados:
                musica_id = musica.get('id')
                if not musica_id or musica_id in ids_vistos or not musica.get('title'):
                    continue

                ids_vistos.add(musica_id)
                user = musica.get('user') or {}
                artwork = musica.get('artwork') or {}

                resultados.append({
                    'id': musica_id,
                    'title': musica.get('title'),
                    'artist': (user.get('name') or 'Artista desconhecido'),
                    'artwork': artwork.get('150x150') or '',
                    'url': f"https://discoveryprovider.audius.co/v1/tracks/{musica_id}/stream?app_name=MUSICSTREAM"
                })

                if len(resultados) >= limit:
                    return resultados
        except Exception as e:
            print(f'Erro ao carregar músicas aleatórias da Audius: {e}')

    return resultados[:limit]


def register_routes(app):
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/register')
    @app.route('/signup')
    def register_redirect():
        return redirect(url_for('cadastro'))

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            email = request.form.get('email')
            senha = request.form.get('senha')

            usuario = Usuario.query.filter_by(email=email).first()

            if usuario and check_password_hash(usuario.senha_hash, senha):
                session.clear()
                login_user(usuario)
                session['musicas_home'] = obter_musicas_aleatorias(limit=12)
                return redirect(url_for('home'))
            else:
                flash('E-mail ou senha incorretos.')

        return render_template('login.html')

    @app.route('/cadastro', methods=['GET', 'POST'])
    def cadastro():
        if request.method == 'POST':
            nome = request.form.get('nome')
            email = request.form.get('email')
            senha = request.form.get('senha')
            confirmar_senha = request.form.get('confirmar_senha')

            if senha != confirmar_senha:
                return render_template('cadastro.html', erro='As senhas não coincidem!')

            usuario_existente = Usuario.query.filter_by(email=email).first()
            if usuario_existente:
                return render_template('cadastro.html', erro='Este e-mail já está cadastrado!')

            senha_criptografada = generate_password_hash(senha)
            novo_usuario = Usuario(nome=nome, email=email, senha_hash=senha_criptografada)

            db.session.add(novo_usuario)
            db.session.commit()

            return redirect(url_for('confirmacao'))

        return render_template('cadastro.html')

    @app.route('/confirmacao')
    def confirmacao():
        return render_template('confirmacao.html')

    @app.route('/home')
    @login_required
    def home():
        musicas_home = session.get('musicas_home') or obter_musicas_aleatorias(limit=12)
        session['musicas_home'] = musicas_home
        return render_template('home.html', usuario=current_user.nome, musicas_home=musicas_home)

    @app.route('/biblioteca')
    @login_required
    def biblioteca():
        curtidas = Curtida.query.filter_by(usuario_id=current_user.id).order_by(Curtida.criada_em.desc()).all()
        return render_template('biblioteca.html', curtidas=curtidas, usuario=current_user.nome)

    @app.route('/buscar', methods=['GET'])
    @login_required
    def buscar():
        query = request.args.get('q', '')
        resultados = []

        if query:
            try:
                url = f'https://discoveryprovider.audius.co/v1/tracks/search?query={query}&app_name=MUSICSTREAM'
                resposta = requests.get(url, timeout=5)

                if resposta.status_code == 200:
                    dados = resposta.json()
                    resultados = dados.get('data', [])
            except Exception as e:
                print(f'Erro ao buscar na API da Audius: {e}')

        return render_template('buscar.html', resultados=resultados, query=query, usuario=current_user.nome)

    @app.route('/api/curtidas/<track_id>', methods=['GET', 'POST', 'DELETE'])
    @login_required
    def gerenciar_curtida(track_id):
        curtida = Curtida.query.filter_by(usuario_id=current_user.id, track_id=track_id).first()

        if request.method == 'GET':
            return jsonify({'curtida': curtida is not None})

        if request.method == 'DELETE':
            if curtida:
                db.session.delete(curtida)
                db.session.commit()
            return jsonify({'curtida': False})

        dados = request.get_json(silent=True) or {}
        if not curtida:
            campos_obrigatorios = ('titulo', 'artista', 'url_audio')
            if any(not dados.get(campo) for campo in campos_obrigatorios):
                return jsonify({'erro': 'Dados da música incompletos.'}), 400
            curtida = Curtida(
                usuario_id=current_user.id,
                track_id=track_id,
                titulo=dados['titulo'],
                artista=dados['artista'],
                url_audio=dados['url_audio'],
                capa_url=dados.get('capa_url')
            )
            db.session.add(curtida)
            db.session.commit()
        return jsonify({'curtida': True})

    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        session.clear()
        return redirect(url_for('login'))
