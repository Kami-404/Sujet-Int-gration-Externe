const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch');

//on va initier ici l'applicaiton express
const app = express();
const port = 3001;

app.use(bodyParser.json());
app.use(cors());

//connexion à la base de données avec les logs
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'valib'
});

// on va vérifier ici la connexion s'effectue bien à la base de données
connection.connect(err => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err);
        return;
    }
    console.log('COnnexion à la base de données succès!');
    createTables();
});

// on va venir créer la table 'directions" qui va contenir les informations de l'historique de sauvegarde d'itinéraires du user
//on va aussi vérifier si la table existe déjà sinon la créer 
function createTables() { 
    const checkDirectionsTable = `
        SELECT 1 FROM directions LIMIT 1;
    `;
    
    connection.query(checkDirectionsTable, (err, result) => {
        if (err) {
            console.error('erreur de verificatoin de table:', err);
            return;
        }
        // si la table n'existe pas, elle sera créer 
        if (result.length === 0) {
            const createDirectionsTable = `
                CREATE TABLE directions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    station_name VARCHAR(255) NOT NULL,
                    start_address VARCHAR(255) NOT NULL,
                    directions_text TEXT NOT NULL,
                    map_image TEXT
                );
            `;
            // ici on va exécuté la requete de création de la table et afficher des messages en fonctions de la status de création
            connection.query(createDirectionsTable, (err, result) => {
                if (err) {
                    console.error('erreur de creaton de table:', err);
                    return;
                }
                console.log('La table est créer avec succès!');
            });
        } else {
            console.log('La table DIrections existe deja!');
        }
    });
}

//fonctions pour vérifier si le token est valide ou pas
async function verifyToken(token) {
    try {
        // on va faire une requete http post pour vérifié le token auprès du serveur auth
        const response = await fetch('http://localhost:2999/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jeton: token })
        });
        const data = await response.json(); // récupération des donnéées en JSON
        return data.statut === 'Succès'; // return true si le statut est succès
    } catch (error) {
        console.error('Erreur de token:', error);
        return false; // retourne faux dans le cas contraie
    }
}

// on va taper sur l'url pour sauvegarder les directions dans la base de données
app.post('/save-directions', async (req, res) => {
    const { token, station, address, directions, map_image } = req.body;
    // on va faire une vérification de token en appelant la fonction verifyToken
    if (!await verifyToken(token)) {
        return res.status(401).json({ statut: 'Erreur', message: 'Jeton invalide' });
    }

    // requete mysql pour inserer les directions dans la table 
    const sql = `INSERT INTO directions (station_name, start_address, directions_text, map_image)
                 VALUES (?, ?, ?, ?)`;
    // on va exécuter la requete sql avec les valeurs spécifiques
    connection.query(sql, [station.name, address, directions, map_image], (err, result) => {
        if (err) {
            console.error('Erreur de sauvegarde:', err);
            res.status(500).send('Erreur de sauvegarde');
            return;
        }
        console.log('La table est sauvegardé avec succès');
        res.status(200).send('La table est sauvegardé avec succès');
    });
});

// on va faire une requete sur l'url /login du serveur auth pour la connexion de l'utilisateur
app.post('/login', async (req, res) => {
    const { identifiant, motdepasse } = req.body;

    if (!identifiant || !motdepasse) {
        return res.status(400).json({ statut: 'Erreur', message: 'JSON incorrect' });
    }

    try {
        const response = await fetch('http://localhost:2999/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiant, motdepasse })
        });

        const data = await response.json();

        if (data.statut === 'Succès') {
            res.json({ statut: 'Succès', message: 'Utilisateur connecter', token: data.token });
        } else {
            res.json({ statut: 'Erreur', message: data.message });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

// ici c'est pour modifier les ifnormations de l'utilisateurs
app.patch('/update', async (req, res) => {
    const { id } = req.query;
    const { identifiant, newPassword, token } = req.body;

    // on va passer par une vérification de token pour confirmé l'identité
    if (!await verifyToken(token)) {
        return res.status(401).json({ statut: 'Erreur', message: 'Jeton invalide' });
    }
    // puis une vérification des paramètres de la requetes
    if (!id || (!identifiant && !newPassword)) {
        return res.status(400).json({ statut: 'Erreur', message: 'JSON incorrect' });
    }

    try {
        const response = await fetch('http://localhost:2999/update', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, identifiant, newPassword })
        });

        const data = await response.json();

        if (data.statut === 'Succès') {
            res.json({ statut: 'Succès', message: 'Mise à jour réussis' });
        } else {
            res.json({ statut: 'Erreur', message: data.message });
        }
    } catch (error) {
        console.error('eurreur pendant la modificaiton:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

// c'est pour la déconnexion de l'utilisateur
app.post('/logout', async (req, res) => {
    const { token } = req.body;
    // à nouveau vérifier le token
    if (!token) {
        return res.status(400).json({ statut: 'Erreur', message: 'JSON incorrect' });
    }

    try {
        const response = await fetch('http://localhost:2999/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jeton: token })
        });

        const data = await response.json();

        if (data.statut === 'Succès') {
            res.json({ statut: 'Succès', message: 'Déconnexion reussi' });
        } else {
            res.json({ statut: 'Erreur', message: data.message });
        }
    } catch (error) {
        console.error('Erreur de deconnexion:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

// il s'agit du endpoint pour enregistrer un nouveau user dans le système
app.post('/register', async (req, res) => {
    const { identifiant, motdepasse } = req.body;

    if (!identifiant || !motdepasse) {
        return res.status(400).json({ statut: 'Erreur', message: 'JSON incorrect' });
    }

    try {
        const response = await fetch('http://localhost:2999/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiant, motdepasse })
        });

        const data = await response.json();

        if (data.statut === 'Succès') {
            res.json({ statut: 'Succès', message: 'Utilisateur enregistré', token: data.token });
        } else {
            res.json({ statut: 'Erreur', message: data.message });
        }
    } catch (error) {
        console.error('Erreur durant linscription:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

// il s'agit de la requete pour générer un itinéraire en pdf choisi par l'utilsateur
app.post('/itinerary', async (req, res) => {
    const { token, itinerary, name, points, directions, map_image } = req.body;

    if (!await verifyToken(token)) {
        return res.status(401).json({ statut: 'Erreur', message: 'Jeton incorrect' });
    }

    try {
        const response = await fetch('', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itinerary, name, token, points, directions, map_image })
        });

        if (response.status === 204) {
            res.status(204).send();
        } else {
            const data = await response.json();
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error('Erroeur de génération ditineraire:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

// il s'agit de la requete pour récupérer le pdf !
app.get('/itinerary', async (req, res) => {
    const { id } = req.query;
    const { token } = req.body;
    // vérification de la paramètre avec le token
    if (!token || !id) {
        return res.status(400).json({ statut: 'Erreur', message: 'JSON incorrect' });
    }

    if (!await verifyToken(token)) {
        return res.status(401).json({ statut: 'Erreur', message: 'Jeton incorrect' });
    }

    try {
        const response = await fetch(`/itinerary?id=${id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 200) {
            const pdfBuffer = await response.buffer();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="itinerary_${id}.pdf"`);
            res.send(pdfBuffer);
        } else {
            const data = await response.json();
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error('Error during PDF retrieval:', error);
        res.status(500).json({ statut: 'Erreur', message: 'erreur sur le serveur' });
    }
});

app.listen(port, () => {
    console.log(`le serveur tourne sur http://localhost:${port}`);
});