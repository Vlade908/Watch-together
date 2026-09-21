# 🎬 Watch Together ML — Microsserviço de Recomendação por Fatores Latentes

Microsserviço de Machine Learning desenvolvido em **Python + FastAPI**, responsável pelo treinamento e inferência de modelos de **Fatoração de Matriz (TruncatedSVD / Collaborative Filtering)** e geração de fatores latentes compatíveis com busca vetorial no **PostgreSQL 16** (`pgvector` HNSW).

---

## 🚀 Arquitetura & Algoritmo

1. **Extração Unificada:** Combina avaliações explícitas (`user_ratings`) e feedback implícito ponderado de streaming (`watch_progress`).
2. **Decomposição em Valores Singulares (`TruncatedSVD`):** Descobre padrões latentes de afinidade e reconstrói a matriz aproximada de notas para usuários e títulos.
3. **Projeção em 1536 Dimensões com pgvector:** Projeta os fatores latentes dos usuários em vetores normalizados em norma L2 de 1536 dimensões e grava na tabela `user_embeddings` do PostgreSQL com índice de grafo HNSW.
4. **Fallback Inteligente (Cold-Start):** Ranqueamento ponderado de popularidade e recência para novos usuários sem histórico prévio.

---

## 🛠️ Instalação e Execução

### 1. Criar o Ambiente Virtual
```bash
python -m venv .venv
```

### 2. Ativar o Ambiente Virtual
- **Windows (PowerShell):**
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Linux / macOS:**
  ```bash
  source .venv/bin/activate
  ```

### 3. Instalar as Dependências
```bash
pip install -r requirements.txt
```

### 4. Iniciar a API com Uvicorn
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 📡 Endpoints da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/health` | Status do serviço, conexão com PostgreSQL e metadados do modelo |
| `GET` | `/recommend/{user_id}` | Top títulos recomendados ordenados por score previsto e match percentage |
| `POST` | `/retrain` | Retreina o modelo SVD com os dados atuais do banco e atualiza `user_embeddings` |
| `GET` | `/docs` | Documentação interativa Swagger UI gerada pelo FastAPI |
