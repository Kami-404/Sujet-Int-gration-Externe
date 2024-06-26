// Import du module "express" afin de créer un serveur HTTP
const express = require("express");
// Import du module "body-parser" afin de transformer les données entrantes en formats manipulables
const bodyParser = require("body-parser");
// Import de bcrypt afin de hash les mots de passe
const bcrypt = require("bcryptjs");
// Import de mysql2 afin de
const mysql = require("mysql2/promise");
// Chargement du fichier d'environnement
require("dotenv").config();
// Import du module "jsonwebtoken" pour gérer les token d'authentification et par conséquent les sessions utiilsateurs
const jwt = require("jsonwebtoken");
// Import de CORS afin de contôoler les demandes depuis un autre domaine
const cors = require("cors");

// Crée un serveur web avec "express"
const app = express();

// Je récupère le JWT_SECRET dans mon fichier environnement. Il permet de signer les tokens afin que le serveur puisse les valider.
const JWT_SECRET = process.env.JWT_SECRET;

// Gestion des erreurs CORS
app.use(
    cors({
        // Je définis les origines autorisées à accéder aux ressources du serveur
        origin: process.env.URL_CORS,
        // J'autorise certaines méthodes
        methods: "GET, POST, PATCH",
        // J'autorise certaines en-têtes
        allowedHeaders: "Content-Type, Authorization",
    })
);

// Permet de lire et parser les données de formulaite HTML
app.use(bodyParser.urlencoded({ extended: true }));
// Utilise "bodyParser" pour convertir les données JSON en objets javascript afin de pouvoir les manipuler
app.use(bodyParser.json());

app.use((req, res, next) => {
    // S'il y a déjà une variable req.db, on continue
    if (req.db) {
        next();
    } else {
        // On crée la connexion
        mysql
            .createConnection({
                // Voir fichier .env qui contient les informations de connection
                host: process.env.DATABASE_HOST,
                user: process.env.DATABASE_USER,
                password: process.env.DATABASE_PASS,
                database: process.env.DATABASE_NAME,
            })
            .then((connection) => {
                // On stocke la connexion dans l'objet req
                req.db = connection;
                // On passe à la suite
                next();
            })
            .catch((error) => {
                // Voici ce que j'envoie si une erreur se produit. Statut 500 pour spécifié que la base de données n'est pas disponible avec un message pour spécifier pourquoi.
                if (error.code === "ER_ACCESS_DENIED_ERROR") {
                    res.status(500).send(
                        "Accès refusé. Vérifiez vos identifiants"
                    );
                } else if (error.code === "ER_BAD_DB_ERROR") {
                    res.status(500).send("Base de données inconnue.");
                } else if (
                    error.code === "ETIMEDOUT" ||
                    error.code === "ENETUNREACH"
                ) {
                    res.status(500).send(
                        "Impossible de joindre le serveur de la base de données"
                    );
                } else {
                    res.status(500).send(
                        "Erreur de connexion à la base de données:",
                        error
                    );
                }
            });
    }
});

// On créé une fonction qui vérifie si le contenu de la requête contient bien un identifiant et un mot de passe
function validateRegisterAndLogin(req, res, next) {
    // On vérifie si au moins un des champs "identifiant" ou "mot de passe" sont absents ou vides dans le corps de la requête
    if (!req.body.identifiant || !req.body.motdepasse) {
        return res
            .status(400)
            .json({ statut: "Erreur", message: "JSON incorrect" });
    }
    // On appel la fonction "next" si les champs requis sont présents afin de passer à la suite du code.
    next();
}

// On créé une fonction qui vérifie si le contenu de la requête contient bien un jeton
function validateToken(req, res, next) {
    // On vérifie si le champs "jeton" est absent ou vide dans le corps de la requête
    if (!req.body.jeton) {
        return res
            .status(400)
            .json({ statut: "Erreur", message: "JSON incorrect" });
    }
    // On appel la fonction "next" si le champs requis est présent afin de passer à la suite du code.
    next();
}

// On créé une fonction qui vérifie si l'utilisateur est connecté
async function verifiedConnection(req, res, next) {
    // Je récupère le token qui est envoyé
    token = req.body.jeton;

    // On vérifie si le champs "jeton" est absent ou vide dans le corps de la requête
    if (!token) {
        return res
            .status(400)
            .json({ statut: "Erreur", message: "JSON incorrect" });
    }

    try {
        // On récupère le username de l'utilisateur si son token est toujours valide et présent dans la base de données
        const [results] = await req.db.execute(
            // Je joint les deux tables "users" et "tokens" pour accéder aux données utilisateur;
            `SELECT u.username 
            FROM tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = ? AND t.expires_at > NOW();`,
            [token] // Je passe le token en tant que paramètre de la requête afin d'éviter l'injection de code
        );

        // Vérification des résultats retournés par la requête.
        if (results.length > 0) {
            // On appel la fonction "next" si le champs requis est présent afin de passer à la suite du code.
            next();
        } else {
            // Si aucun token a été trouvé alors je renvoie une erreur 401 : Unauthorized
            res.status(401).json({
                statut: "Erreur",
                message: "Jeton inconnu",
            });
        }
    } catch (error) {
        // Voici ce que j'envoie si une autre erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
}

// function pour générer le token d'authentification
function generateAccessToken(user) {
    return jwt.sign(user, JWT_SECRET, { expiresIn: "3600s" });
}

// function pour inscrire le token dans la table 'token'
async function createToken(token, userId, db) {
    const expiresAt = new Date(Date.now() + 3600000);
    await db.execute(
        "INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
        [token, userId, expiresAt]
    );
}

// On définit une route POST pour gérer les inscriptions
app.post("/register", validateRegisterAndLogin, async (req, res) => {
    // Je récupère l'identifiant
    const username = req.body.identifiant;
    // Je récupère le mot de passe en clair
    const password = req.body.motdepasse;

    try {
        // Je hash le mot de passe à l'aide de "bcrypt". Le "10" signifie le nombre de fois que l'algorithme de hash est effectué. Plus le nombre est grand plus la sécurité est grande mais plus le temps d'exécution est long.
        // C'est pourquoi on utilise await afin d'attendre la fin d'exécution de bcrypt qui peut être plus ou moins longue selon le nombre de fois que l'algorithme de hash est effectué.
        const hashedpassword = await bcrypt.hash(password, 10);

        // Je lance ce code la première fois afin de créer la table "users"
        // await req.db.execute(
        //     'CREATE TABLE users (id INT AUTO_INCREMENT, username VARCHAR(64) NOT NULL, password BINARY(60) NOT NULL, PRIMARY KEY (id), UNIQUE(username))',
        // );

        // Je lance ce code la première fois afin de créer la table "token" qui contiendra chaque token avec son user_id
        // await req.db.execute(
        //     'CREATE TABLE tokens (id INT AUTO_INCREMENT PRIMARY KEY, token TEXT NOT NULL, user_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP)',
        // );

        // On utilise 'await' afin d'attendre que la promesse soit résolue
        const [userResult] = await req.db.execute(
            // 'INSERT INTO' permet d'ajouter de nouvelles données dans une table
            // Les '?' sont des méthodes paramétrés afin d'éviter notamment l'injection de code dans un formulaire qui permet la manipulation de la base de données
            "INSERT INTO `users` VALUES(?, ?, ?)",
            [
                null, // car la première colonne est 'id' qui est en auto increment
                username,
                // On ne stocke pas le password dans la base de données, parce qu'on ne stocke pas les mots de passe en clair
                // On stocke LE hash
                hashedpassword,
            ]
        );

        // J'appelle la fonction 'generateAccessToken' afin de créer un token d'authentification
        const accessToken = generateAccessToken({ username: username });

        // Je récupère l'id de l'utilisateur qui vient d'être créé
        const userId = userResult.insertId;

        // J'appelle la fonction pour inscrire le token dans la base de données
        createToken(accessToken, userId, req.db);

        // Voici ce que j'envoie si l'inscription s'est bien passé. Statut 200 pour spécifié que le serveur à réussi à traiter la requête et un message pour donner plus d'indications.
        res.status(200).json({
            statut: "Succès",
            message: `Utilisateur ${username} créé !`,
            token: `${accessToken}`,
        });
    } catch (error) {
        // Voici ce que j'envoie si une erreur de duplication intervient. Statut 409 pour spécifié un conflit que le client doit résoudre. Dans notre cas, un username déjà existant.
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                statut: "Erreur",
                message: "Nom d'utilisateur déjà utilisé",
            });
        }

        // Voici ce que j'envoie si une autre erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
});

// On définit une route POST pour gérer les connexions
app.post("/login", validateRegisterAndLogin, async (req, res) => {
    // Je récupère l'identifiant
    const username = req.body.identifiant;
    // Je récupère le mot de passe en clair
    const password = req.body.motdepasse;

    try {
        // Je récupère dans la base de données le password qui est lié à l'utilisateur renseigné
        const [username_exist] = await req.db.execute(
            "SELECT id, password FROM `users` WHERE username = ?",
            [username]
        );

        if (username_exist.length === 0) {
            // Voici ce que j'envoie si aucun utilisateur est trouvé. Statut 401 pour spécifié que la connexion n'est pas autorisée.
            return res
                .status(401)
                .json({ statut: "Erreur", message: "Identifiants incorrects" });
        }

        // On compare le mot de passe fourni avec le hash stocké dans la base de données
        // Bcrypt permet de vérifier directement s'il exite une correspondance ou non. Il suffit d'utiliser compare et de renseigner les deux mots de passe
        const validPassword = await bcrypt.compare(
            password,
            username_exist[0].password.toString()
        );

        // On vérifie si le mot de passe correspond à l'utilisateur
        if (!validPassword) {
            // Voici ce que j'envoie s'il n'y a pas de correspondance entre les deux mots de passe. Statut 401 pour spécifié que la connexion n'est pas autorisée.
            return res
                .status(401)
                .json({ statut: "Erreur", message: "Identifiants incorrects" });
        }

        // J'appelle la fonction 'generateAccessToken' afin de créer un token d'authentification
        const accessToken = generateAccessToken({ username: username });

        // Je récupère l'id de l'utilisateur qui vient d'être créé
        const userId = username_exist[0].id;

        // J'appelle la fonction pour inscrire le token dans la base de données
        createToken(accessToken, userId, req.db);

        // Voici ce que j'envoie si la connexion s'est bien passé. Statut 200 pour spécifié que le serveur à réussi à traiter la requête et un message pour donner plus d'indications.
        res.status(200).json({
            statut: "Succès",
            message: `Utilisateur ${username} connecté !`,
            token: `${accessToken}`,
        });
    } catch (error) {
        // Voici ce que j'envoie si une erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
});

app.post("/logout", validateToken, async (req, res) => {
    // Je récupère le token qui est envoyé dans le corps de la requête
    const token = req.body.jeton;

    if (!token) {
        return res
            .status(400)
            .json({ statut: "Erreur", message: "JSON incorrect" });
    }

    try {
        // Supprimer le token dans la base de données
        const [results] = await req.db.execute(
            "DELETE FROM tokens WHERE token = ?",
            [token]
        );

        // Si aucun token a été trouvé alors je renvoie une erreur 401 : Unauthorized
        if (results.affectedRows === 0) {
            return res
                .status(401)
                .json({ statut: "Erreur", message: "Jeton inconnu" });
        }

        // Voici ce que j'envoie si la déconnexion s'est bien passé. Statut 200 pour spécifié que le serveur à réussi à supprimer le token de la base de données pour déconnecter l'utilisateur.
        res.status(200).json({
            statut: "Succès",
            message: `Utilisateur déconnecté !`,
        });
    } catch (error) {
        // Voici ce que j'envoie si une erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
});

app.post("/verify", validateToken, async (req, res) => {
    // Je récupère le token qui est envoyé dans le corps de la requête
    const token = req.body.jeton;

    try {
        // On récupère le username de l'utilisateur si son token est toujours valide et présent dans la base de données
        const [results] = await req.db.execute(
            // Je joint les deux tables "users" et "tokens" pour accéder aux données utilisateur;
            `SELECT u.username, u.id
            FROM tokens t
            JOIN users u ON t.user_id = u.id
            WHERE t.token = ? AND t.expires_at > NOW();`,
            [token] // Je passe le token en tant que paramètre de la requête afin d'éviter l'injection de code
        );

        // Vérification des résultats retournés par la requête.
        if (results.length > 0) {
            // Si le tableau "results" contient au moins un élément alors cela signifie que le token est valide.
            res.status(200).json({
                statut: "Succès",
                message: "token validé !",
                utilisateur: {
                    userId: results[0].id,
                    identifiant: results[0].username,
                },
            });
        } else {
            // Si aucun token a été trouvé alors je renvoie une erreur 401 : Unauthorized
            res.status(401).json({
                statut: "Erreur",
                message: "Jeton inconnu",
            });
        }
    } catch (error) {
        // Voici ce que j'envoie si une erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
});

app.patch("/update", verifiedConnection, async (req, res) => {
    // Je récupère l'id de l'utilisateur dans la requête GET d'où le query
    const userId = req.body.id;
    // Je récupère l'identifiant dans le corps de la requête
    const username = req.body.identifiant;
    // Je récupère le password dans le corps de la requête
    const newPassword = req.body.motdepasse;

    if (!userId) {
        // Voici ce que j'envoie si une erreur se produit. Statut 400 pour spécifié que l'identifiant de l'utilisateur n'a pas été trouvé'.
        return res.status(400).json({});
    }

    if (!req.body || (!username && !newPassword)) {
        // Voici ce que j'envoie si une erreur se produit. Statut 400 pour spécifié que le nom et le mot de passe de l'utilisateur n'ont pas été trouvés.
        return res.status(400).json({});
    }

    try {
        if (username) {
            // Si l'utilisateur a envoyé un nouveau nom alors je trouve l'utilisateur avec son id et je remplace son username
            await req.db.execute("UPDATE users SET username = ? WHERE id = ?", [
                username,
                userId,
            ]);
        }

        if (newPassword) {
            // Je hash le mot de passe à l'aide de "bcrypt". Le "10" signifie le nombre de fois que l'algorithme de hash est effectué. Plus le nombre est grand plus la sécurité est grande mais plus le temps d'exécution est long.
            // C'est pourquoi on utilise await afin d'attendre la fin d'exécution de bcrypt qui peut être plus ou moins longue selon le nombre de fois que l'algorithme de hash est effectué.
            const hashedpassword = await bcrypt.hash(newPassword, 10);
            // Si l'utilisateur a envoyé un nouveau mot de passe alors je trouve l'utilisateur avec son id et je remplace son password avec le nouveau mot de passe haché
            await req.db.execute("UPDATE users SET password = ? WHERE id = ?", [
                hashedpassword,
                userId,
            ]);
        }

        // Voici ce que j'envoie si les modifications ont bien été réalisé. Statut 200 pour spécifié que le serveur à réussi à modifier le ou les données de l'utilisateur.
        res.status(200).json({
            statut: "Succès",
            message: `Les modifications ont bien été effectuées`,
        });
    } catch (error) {
        // Voici ce que j'envoie si une erreur de duplication intervient. Statut 409 pour spécifié un conflit que le client doit résoudre. Dans notre cas, un username déjà existant.
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                statut: "ErreurIdentifiant",
                message: "Nom d'utilisateur déjà utilisé",
            });
        }

        // Voici ce que j'envoie si une erreur serveur se produit. Statut 500 pour spécifié que le serveur n'est pas disponible.
        res.status(500).json({
            statut: "Erreur",
            message: "Erreur du serveur, veuilleur réessayer ultérieurement",
        });
    }
});

app.listen(process.env.PORT_AUTH, () => {
    console.log(`On écoute sur le port ${process.env.PORT_AUTH}`);
});
