# 🖊️ FlipCollab

Tableau blanc collaboratif temps réel pour Samsung Flip Pro.
Fonctionne en local (WiFi) ET sur serveur distant (Railway).

---

## 🚀 Option A – Serveur distant gratuit avec Railway (recommandé)

### Étape 1 – Créer un compte GitHub (gratuit)
→ https://github.com/signup

### Étape 2 – Mettre le code sur GitHub
1. Va sur https://github.com/new
2. Crée un dépôt appelé `flipcollab` (Public)
3. Clique "uploading an existing file"
4. Glisse-dépose TOUS les fichiers de ce dossier
5. Clique "Commit changes"

### Étape 3 – Déployer sur Railway (gratuit)
1. Va sur https://railway.app
2. Clique "Start a New Project"
3. Choisis "Deploy from GitHub repo"
4. Sélectionne ton dépôt `flipcollab`
5. Railway détecte Node.js automatiquement et lance le serveur

### Étape 4 – Obtenir ton URL publique
1. Dans Railway, clique sur ton projet
2. Onglet "Settings" → "Networking" → "Generate Domain"
3. Tu obtiens une URL du type : `flipcollab-production.up.railway.app`

### Étape 5 – Utiliser
- **Sur le Flip** : ouvre `https://flipcollab-production.up.railway.app`
- **Participants** : scannent le QR code ou ouvrent `/join?session=default`
- **Depuis n'importe où dans le monde** ✅

---

## 💻 Option B – En local (même WiFi)

1. Installe Node.js : https://nodejs.org
2. Double-clique `START.bat` (Windows) ou `./start.sh` (Mac/Linux)
3. Ouvre `http://TON_IP:3000` sur le Flip

---

## 🎨 Fonctionnalités

- Dessin libre, marqueur, gomme
- Couleur unique par participant
- Pointeur laser visible sur tous les écrans
- Undo / Effacer tout / Export PNG
- QR code d'invitation automatique
- Fonctionne sur Flip, PC, téléphone, tablette

---

## 📁 Structure

```
flipcollab/
├── server.js        ← Serveur Node.js (zéro dépendance npm)
├── package.json     ← Config Railway/Node
├── public/
│   ├── flip.html    ← Page grand écran (Flip)
│   ├── mobile.html  ← Page participants
│   └── qr.js        ← Générateur QR code
├── START.bat        ← Lancement Windows local
└── start.sh         ← Lancement Mac/Linux local
```
