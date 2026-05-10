const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const bcrypt = require("bcrypt");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/* =========================
   DB
========================= */
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "digital_store_db"
});

const ADMIN_DATA_KEYS = ["products","users","orders","reviews","categories","criteria","deliveries","reco"];
const adminSessions = new Map();

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });


function parseDesc(raw) {
  if (!raw) return { text: '', oldPrice: null, badge: null };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        text:     parsed.text     || '',
        oldPrice: parsed.oldPrice || null,
        badge:    parsed.badge    || null
      };
    }
  } catch (_) {}
  // Pas du JSON → c'est du texte brut
  return { text: raw, oldPrice: null, badge: null };
}




function createAdminToken(email) {
  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, { email, createdAt: Date.now() });
  return token;
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !adminSessions.has(token))
    return res.status(401).json({ success: false, message: "Session admin invalide" });
  req.adminSession = adminSessions.get(token);
  next();
}

async function ensureAdminStorage() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

db.connect(async (err) => {
  if (err) { console.log("❌ DB error:", err); return; }
  console.log("✅ MySQL connected");
  try { await ensureAdminStorage(); console.log("✅ Admin storage ready"); }
  catch (e) { console.log("❌ Admin storage error:", e); }
});

/* =========================
   FRONTEND
========================= */
const FRONTEND_DIR = path.join(__dirname, "FrontEnd");

app.get("/FenetreAdmine.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetreAdmine.html"));
});

app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetreDemarage.HTML"));
});

app.get("/boutique", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "FenetrePrincipale.html"));
});

app.get("/admin", (req, res) => {
  res.redirect('/FenetreAdmine.html');
});

/* =========================
   REGISTER
========================= */
app.post("/api/register", async (req, res) => {
  const { nom, prenom, email, password, telephone } = req.body;
  if (!email || !password) return res.json({ success: false, message: "Champs manquants" });
  try {
    const existing = await query(
      "SELECT idUtilisateur FROM utilisateur WHERE email = ?", 
      [email]
    );
    if (existing.length > 0) 
      return res.json({ success: false, message: "Email déjà utilisé" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO utilisateur (nom, prenom, email, motDePasse, telephone, typeUtilisateur, dateInscription, estActif)
       VALUES (?, ?, ?, ?, ?, 'client', NOW(), 1)`,
      [nom || "", prenom || "", email, hashedPassword, telephone || ""]
    );
    const newId = result.insertId;

    await query(
      `INSERT IGNORE INTO client (idUtilisateur, adresseLivraison, wilaya) VALUES (?, '', '')`,
      [newId]
    ).catch(() => {});

    await query(
      `INSERT IGNORE INTO comptefidelite (pointsTotal, dateMAJ, idClient, idNiveau) VALUES (0, NOW(), ?, 1)`,
      [newId]
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.log("Register error:", err);
    res.json({ success: false, message: "Erreur inscription" });
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) 
    return res.json({ success: false, message: "Champs manquants" });
  try {
    const results = await query(
      "SELECT * FROM utilisateur WHERE email = ? AND estActif = 1",
      [email]
    );
    if (!results.length) 
      return res.json({ success: false, message: "Utilisateur introuvable" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.motDePasse);
    if (!match) 
      return res.json({ success: false, message: "Mot de passe incorrect" });

    res.json({
      success: true,
      user: {
        id: user.idUtilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        type: user.typeUtilisateur
      }
    });
  } catch (err) {
    console.log("Login error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   GET PROFILE
========================= */
app.get("/api/profile/:id", async (req, res) => {
  try {
    const results = await query(`
      SELECT u.idUtilisateur, u.nom, u.prenom, u.email, u.telephone,
             c.adresseLivraison, c.wilaya,
             COALESCE(cf.pointsTotal, 0) AS pointsTotal,
             nf.libelle AS niveauFidelite
      FROM utilisateur u
      LEFT JOIN client c ON c.idUtilisateur = u.idUtilisateur
      LEFT JOIN comptefidelite cf ON cf.idClient = u.idUtilisateur
      LEFT JOIN niveaufidelite nf ON nf.idNiveau = cf.idNiveau
      WHERE u.idUtilisateur = ?
    `, [req.params.id]);

    if (!results.length) 
      return res.json({ success: false, message: "Profil introuvable" });
    res.json({ success: true, profile: results[0] });
  } catch (err) {
    console.log("Profile error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   UPDATE PROFILE
========================= */
app.put("/api/profile/:id", async (req, res) => {
  const { nom, prenom, telephone, adresseLivraison, wilaya } = req.body;
  try {
    await query(
      "UPDATE utilisateur SET nom=?, prenom=?, telephone=? WHERE idUtilisateur=?",
      [nom || "", prenom || "", telephone || "", req.params.id]
    );
    await query(
      `INSERT INTO client (idUtilisateur, adresseLivraison, wilaya) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE adresseLivraison=VALUES(adresseLivraison), wilaya=VALUES(wilaya)`,
      [req.params.id, adresseLivraison || "", wilaya || ""]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Profile update error:", err);
    res.json({ success: false, message: "Erreur mise à jour" });
  }
});

/* =========================
   CHANGE PASSWORD
========================= */
app.put("/api/password/:id", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.json({ success: false, message: "Mot de passe trop court" });
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await query(
      "UPDATE utilisateur SET motDePasse=? WHERE idUtilisateur=?", 
      [hashed, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur changement mot de passe" });
  }
});

/* =========================
   GET ORDERS (client)
========================= */
app.get("/api/orders/:id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCommande, c.statut, c.dateCommande, c.montantTotal,
             c.adresseLivraison, c.wilaya,
             lc.quantite, lc.prixUnitaire, p.nom AS nomProduit,
             l.idLivraison, l.statut AS statutLivraison,
             l.dateEstimee, l.dateEffective, l.fraisLivraison
      FROM commande c
      JOIN lignecommande lc ON lc.idCommande = c.idCommande
      JOIN produit p ON p.idProduit = lc.idProduit
      LEFT JOIN livraison l ON l.idCommande = c.idCommande
      WHERE c.idClient = ?
      ORDER BY c.dateCommande DESC
    `, [req.params.id]);

    const map = {};
    rows.forEach(r => {
      if (!map[r.idCommande]) {
        map[r.idCommande] = {
          id: "DS-" + r.idCommande,
          date: new Date(r.dateCommande).toLocaleDateString("fr-FR", { 
            day: "numeric", month: "long", year: "numeric" 
          }),
          status: r.statutLivraison || r.statut,
          total: Number(r.montantTotal),
          wilaya: r.wilaya || "",
          adresse: r.adresseLivraison || "",
          idLivraison: r.idLivraison || null,
          dateEstimee: r.dateEstimee || null,
          items: []
        };
      }
      map[r.idCommande].items.push({ 
        name: r.nomProduit, 
        qty: r.quantite, 
        price: Number(r.prixUnitaire) 
      });
    });
    res.json({ success: true, orders: Object.values(map) });
  } catch (err) {
    console.log("Orders error:", err);
    res.json({ success: false, orders: [] });
  }
});

/* =========================
   GET ALL ORDERS (Admin)
========================= */
app.get("/api/orders", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCommande, c.statut, c.dateCommande, c.montantTotal,
             u.prenom, u.nom, u.email,
             GROUP_CONCAT(p.nom SEPARATOR ', ') AS nomsProduits
      FROM commande c
      JOIN utilisateur u ON u.idUtilisateur = c.idClient
      JOIN lignecommande lc ON lc.idCommande = c.idCommande
      JOIN produit p ON p.idProduit = lc.idProduit
      GROUP BY c.idCommande, c.statut, c.dateCommande, c.montantTotal, u.prenom, u.nom, u.email
      ORDER BY c.dateCommande DESC
    `);

    const orders = rows.map(r => ({
      id: "DS-" + r.idCommande,
      client: ((r.prenom || '') + " " + (r.nom || '')).trim() || r.email || '—',
      date: new Date(r.dateCommande).toLocaleDateString("fr-FR"),
      status: r.statut,
      total: Number(r.montantTotal),
      items: r.nomsProduits || ""
    }));

    res.json({ success: true, orders });
  } catch (err) {
    console.log("All orders error:", err);
    res.json({ success: false, orders: [] });
  }
});

/* =========================
   SAVE ORDER
========================= */
app.post("/api/orders", async (req, res) => {
  const { idClient, adresseLivraison, wilaya, montantTotal, items, typePaiement } = req.body;
  if (!idClient || !items || !items.length)
    return res.json({ success: false, message: "Données incomplètes" });
  try {
    const result = await query(
      `INSERT INTO commande (statut, adresseLivraison, wilaya, montantTotal, idClient, dateCommande)
       VALUES ('En cours', ?, ?, ?, ?, NOW())`,
      [adresseLivraison || "", wilaya || "", montantTotal, idClient]
    );
    const idCommande = result.insertId;

    for (const item of items) {
      await query(
        "INSERT INTO lignecommande (idCommande, idProduit, quantite, prixUnitaire) VALUES (?, ?, ?, ?)",
        [idCommande, item.idProduit || item.id || 0, item.quantite || item.qty || 1, item.prix || item.price || 0]
      );
    }

    await query(
      "INSERT INTO paiement (typePaiement, montant, datePaiement, statut, idCommande) VALUES (?, ?, NOW(), 'en attente', ?)",
      [typePaiement || "cod", montantTotal, idCommande]
    );


const idPaiement = (await query(
  "SELECT idPaiement FROM paiement WHERE idCommande = ?", [idCommande]
))[0]?.idPaiement;

const paiementDetails = req.body.paiementDetails || {};
if (idPaiement){
  switch (typePaiement) {
    case "ccp":
      await query(
        "INSERT INTO PaiementCCP (idPaiement, numeroCCP, cle) VALUES (?, ?, ?)",
        [idPaiement, paiementDetails.numeroCCP || "", paiementDetails.cle || ""]
      );
      break;
    case "cib":
      await query(
        "INSERT INTO PaiementCIB (idPaiement, numeroCarte, dateExpiration, cvv) VALUES (?, ?, ?, ?)",
        [idPaiement, paiementDetails.numeroCarte || "", paiementDetails.dateExpiration || "", paiementDetails.cvv || ""]
      );
      break;
    case "dahabia":
      await query(
        "INSERT INTO PaiementDahabia (idPaiement, numeroCarte) VALUES (?, ?)",
        [idPaiement, paiementDetails.numeroCarte || ""]
      );
      break;
    case "cod":
      await query(
        "INSERT INTO PaiementLivraison (idPaiement, confirmeParLivreur) VALUES (?, 0)",
        [idPaiement]
      );
      break;
  }
}

    // Points fidélité
    const pts = Math.floor(montantTotal / 1000);
    await query(
      `INSERT INTO comptefidelite (pointsTotal, dateMAJ, idClient, idNiveau)
       VALUES (?, NOW(), ?, 1)
       ON DUPLICATE KEY UPDATE pointsTotal = pointsTotal + ?, dateMAJ = NOW()`,
      [pts, idClient, pts]
    );

    // Création automatique de la livraison
    await query(
      `INSERT INTO livraison (statut, adresse, wilaya, dateEstimee, fraisLivraison, idCommande)
       VALUES ('En préparation', ?, ?, DATE_ADD(NOW(), INTERVAL 5 DAY), 0, ?)`,
      [adresseLivraison || "", wilaya || "", idCommande]
    );

    res.json({ success: true, idCommande: "DS-" + idCommande });
  } catch (err) {
    console.log("Order save error:", err);
    res.json({ success: false, message: "Erreur création commande" });
  }
});


/* =========================
   SUIVI PUBLIC (client) par numéro de commande DS-X
========================= */
app.get("/api/track/:orderNum", async (req, res) => {
  try {
    const rawId = req.params.orderNum.replace(/^DS-/i, "");
    const idCommande = parseInt(rawId);
    if (!idCommande) return res.json({ success: false, message: "Numéro invalide" });

    const rows = await query(`
      SELECT c.idCommande, c.statut AS statutCommande, c.dateCommande,
             c.montantTotal, c.wilaya, c.adresseLivraison,
             l.idLivraison, l.statut AS statutLivraison,
             l.dateEstimee, l.dateEffective, l.fraisLivraison,
             u.prenom, u.nom
      FROM commande c
      LEFT JOIN livraison l ON l.idCommande = c.idCommande
      LEFT JOIN utilisateur u ON u.idUtilisateur = c.idClient
      WHERE c.idCommande = ?
    `, [idCommande]);

    if (!rows.length) return res.json({ success: false, message: "Commande introuvable" });

    const r = rows[0];

    // Articles de la commande
    const items = await query(`
      SELECT p.nom AS name, lc.quantite AS qty, lc.prixUnitaire AS price
      FROM lignecommande lc
      JOIN produit p ON p.idProduit = lc.idProduit
      WHERE lc.idCommande = ?
    `, [idCommande]);

    // Historique suivi livraison
    let suivi = [];
    if (r.idLivraison) {
      suivi = await query(`
        SELECT statut, localisation, description,
               DATE_FORMAT(dateEtape, '%d/%m/%Y à %H:%i') AS dateFormatee
        FROM suivilivraison
        WHERE idLivraison = ?
        ORDER BY dateEtape ASC
      `, [r.idLivraison]);
    }

    // Normaliser 'En cours' (statut commande initial) → 'En préparation' (statut livraison)
    const statusNorm = {
      'en cours': 'En préparation',
      'confirmed': 'En préparation',
      'confirmé': 'En préparation'
    };
    const rawStatut = r.statutLivraison || r.statutCommande || 'En cours';
    const finalStatut = statusNorm[rawStatut.toLowerCase()] || rawStatut;

    res.json({
      success: true,
      order: {
        id: "DS-" + r.idCommande,
        status: finalStatut,
        date: new Date(r.dateCommande).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        total: Number(r.montantTotal),
        wilaya: r.wilaya || "",
        adresse: r.adresseLivraison || "",
        idLivraison: r.idLivraison || null,
        dateEstimee: r.dateEstimee || null,
        items,
        suivi
      }
    });
  } catch (err) {
    console.log("Track error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});


app.put("/api/orders/:id/status", async (req, res) => {
  const { statut } = req.body;
  try {
    const realId = req.params.id.replace("DS-", "");
    await query(
      "UPDATE commande SET statut=? WHERE idCommande=?",
      [statut, realId]
    );

    // Synchroniser le statut de la livraison associée
    const statutLivraisonMap = {
      "en préparation": "En préparation",
      "expédié":        "Expédié",
      "en transit":     "En transit",
      "en cours":       "En préparation",
      "livré":          "Livré",
      "annulé":         "Échec livraison"
    };
    const statutLiv = statutLivraisonMap[statut.toLowerCase()] || null;
    if (statutLiv) {
      const livRows = await query(
        "SELECT idLivraison FROM livraison WHERE idCommande = ?", [realId]
      );
      if (livRows.length) {
        const idLiv = livRows[0].idLivraison;
        await query("UPDATE livraison SET statut=? WHERE idLivraison=?", [statutLiv, idLiv]);
        if (statutLiv === "Livré") {
          await query("UPDATE livraison SET dateEffective=NOW() WHERE idLivraison=?", [idLiv]);
        }
        const STATUT_LABELS = {
          "En préparation": { desc: "Votre commande est en cours de préparation.", loc: "Entrepôt DigitalStore" },
          "Expédié":        { desc: "Votre colis a quitté notre entrepôt.",         loc: "Centre de tri Béjaïa" },
          "En transit":     { desc: "Le colis est en transit vers votre wilaya.",    loc: "En transit" },
          "Livré":          { desc: "Votre colis a été livré avec succès.",          loc: "Adresse de livraison" },
          "Échec livraison":{ desc: "La livraison n'a pas pu être effectuée.",       loc: "Retour entrepôt" }
        };
        const lbl = STATUT_LABELS[statutLiv] || { desc: statutLiv, loc: "" };
        await query(
          `INSERT INTO suivilivraison (statut, localisation, description, dateEtape, idLivraison)
           VALUES (?, ?, ?, NOW(), ?)`,
          [statutLiv, lbl.loc, lbl.desc, idLiv]
        ).catch(e => console.warn("suivilivraison insert warn:", e.message));
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur mise à jour statut" });
  }
});

/* =========================
   GET ALL PRODUCTS (catalogue public)
========================= */
app.get("/api/products", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, p.noteMoyenne,
             cat.nom AS categorie,
             COALESCE(AVG(a.note), 0) AS rating,
             COUNT(a.idAvis) AS ratingCount
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      LEFT JOIN avis a ON a.idProduit = p.idProduit AND a.estVisible = 1
      WHERE p.estDisponible = 1
      GROUP BY p.idProduit
      ORDER BY p.idProduit
    `);

    const products = rows.map(r => {
      const desc = parseDesc(r.description); // ← ajouter cette ligne
      return {
        id: r.idProduit,
        name: r.nom,
        cat: r.categorie || "Divers",
        price: Number(r.prix),
        oldPrice: desc.oldPrice,            // ← remplace null
        badge: desc.badge,                  // ← remplace null
        stock: r.stock > 0,
        img: r.image || "",
        marque: r.marque || "",
        specs: desc.text,                   // ← remplace r.description || ""
        desc: desc.text,                    // ← remplace r.description || ""
        specItems: {},
        rating: Math.round(Number(r.rating) * 10) / 10 || 0,
        ratingCount: Number(r.ratingCount) || 0
      };
    });

    res.json({ success: true, products });
  } catch (err) {
    console.log("Products error:", err);
    res.json({ success: false, products: [] });
  }
});

/* =========================
   GET ALL PRODUCTS ADMIN (TOUS)
========================= */
app.get("/api/admin/products", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, p.noteMoyenne, p.estDisponible,
             cat.nom AS categorie,
             COALESCE(AVG(a.note), 0) AS rating,
             COUNT(a.idAvis) AS ratingCount
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      LEFT JOIN avis a ON a.idProduit = p.idProduit AND a.estVisible = 1
      GROUP BY p.idProduit
      ORDER BY p.estDisponible DESC, p.idProduit DESC
    `);

    const products = rows.map(r => {
      const desc = parseDesc(r.description); // ← ajouter
      return {
        id: r.idProduit,
        name: r.nom,
        cat: r.categorie || "Divers",
        price: Number(r.prix),
        oldPrice: desc.oldPrice,       // ← remplace null
        badge: desc.badge,             // ← remplace null
        stock: r.stock,
        img: r.image || "",
        marque: r.marque || "",
        specs: desc.text,              // ← remplace r.description || ""
        desc: desc.text,               // ← remplace r.description || ""
        specItems: {},
        rating: Math.round(Number(r.rating) * 10) / 10 || 0,
        ratingCount: Number(r.ratingCount) || 0,
        estDisponible: r.estDisponible
      };
    });

    res.json({ success: true, products });
  } catch (err) {
    console.log("Admin products error:", err);
    res.json({ success: false, products: [] });
  }
});

/* =========================
   HARD DELETE PRODUCT (Admin)
========================= */
app.delete("/api/admin/products/:id", async (req, res) => {
  try {
    await query("DELETE FROM lignecommande WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM avis WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM question WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM favoris WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM alerteprix WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM lignepanier WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM produit_promotion WHERE idProduit = ?", [req.params.id]).catch(() => {});
    await query("DELETE FROM produit WHERE idProduit = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.log("Hard delete product error:", err);
    res.json({ success: false, message: "Erreur suppression produit: " + err.message });
  }
});

/* =========================
   TOGGLE PRODUIT DISPONIBLE (Admin)
========================= */
app.put("/api/admin/products/:id/toggle", async (req, res) => {
  try {
    await query(
      "UPDATE produit SET estDisponible = NOT estDisponible WHERE idProduit = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur toggle produit" });
  }
});

/* =========================
   ADD PRODUCT (Admin)
   ✅ FIX : accepte idCategorie directement
========================= */
app.post("/api/products", async (req, res) => {
  const { nom, description, prix, stock, image, marque, idCategorie, oldPrice, badge } = req.body;
  if (!nom || !prix)
    return res.json({ success: false, message: "Nom et prix obligatoires" });
  try {
    let catId = idCategorie || null;
    if (!catId && req.body.categorie) {
      const catRows = await query(
        "SELECT idCategorie FROM categorie WHERE nom = ?", [req.body.categorie]
      );
      if (catRows.length) {
        catId = catRows[0].idCategorie;
      } else {
        const catResult = await query(
          "INSERT INTO categorie (nom, description, icone) VALUES (?, '', '📦')",
          [req.body.categorie]
        );
        catId = catResult.insertId;
      }
    }

    // Encoder oldPrice et badge dans description comme JSON
    const descObj = {
      text: description || "",
      oldPrice: oldPrice ? parseFloat(oldPrice) : null,
      badge: badge || null
    };

    const result = await query(
      `INSERT INTO produit 
        (nom, description, prix, stock, image, marque, noteMoyenne, dateAjout, estDisponible, idCategorie)
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), 1, ?)`,
      [nom, JSON.stringify(descObj), parseFloat(prix), parseInt(stock)||0, image||"", marque||"", catId]
    );
    res.json({ success: true, idProduit: result.insertId });
  } catch(err) {
    res.json({ success: false, message: "Erreur ajout produit: " + err.message });
  }
});

/* =========================
   UPDATE PRODUCT (Admin)
   ✅ FIX PRINCIPAL : catId était non déclaré → crash garanti
========================= */
app.put("/api/products/:id", async (req, res) => {
  // ← remplace l'ancienne destructuration
  const { nom, description, prix, stock, image, marque, oldPrice, badge } = req.body;
  try {
    // Récupérer l'ancien prix AVANT la mise à jour
    const oldRows = await query(
      "SELECT prix FROM produit WHERE idProduit = ?",
      [req.params.id]
    );
    const ancienPrix = oldRows[0]?.prix;

    // Encoder oldPrice et badge dans description
    const descObj = {
      text: description || "",
      oldPrice: oldPrice ? parseFloat(oldPrice) : null,
      badge: badge || null
    };

    let catId = req.body.idCategorie || null;

    if (!catId && req.body.categorie) {
      const catRows = await query(
        "SELECT idCategorie FROM categorie WHERE nom = ?",
        [req.body.categorie]
      );
      if (catRows.length) {
        catId = catRows[0].idCategorie;
      } else {
        const catResult = await query(
          "INSERT INTO categorie (nom, description, icone) VALUES (?, '', '📦')",
          [req.body.categorie]
        );
        catId = catResult.insertId;
      }
    }

    if (!catId) {
      const existing = await query(
        "SELECT idCategorie FROM produit WHERE idProduit = ?",
        [req.params.id]
      );
      catId = existing[0]?.idCategorie || null;
    }

    await query(
      `UPDATE produit SET
        nom=?, description=?, prix=?, stock=?, image=?, marque=?, idCategorie=?
       WHERE idProduit=?`,
      [
        nom    || "",
        JSON.stringify(descObj),  // ← remplace description || ""
        parseFloat(prix)  || 0,
        parseInt(stock)   || 0,
        image  || "",
        marque || "",
        catId,
        req.params.id
      ]
    );

    const nouveauPrix = parseFloat(prix);
    if (ancienPrix && nouveauPrix < ancienPrix) {
      await checkAndCreateNotifications(req.params.id, ancienPrix, nouveauPrix);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Update product error:", err);
    res.json({ success: false, message: "Erreur modification produit: " + err.message });
  }
});

/* =========================
   SOFT DELETE PRODUCT
========================= */
app.delete("/api/products/:id", async (req, res) => {
  try {
    await query(
      "UPDATE produit SET estDisponible = 0 WHERE idProduit = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Delete product error:", err);
    res.json({ success: false, message: "Erreur suppression produit" });
  }
});

/* =========================
   NOTIFICATIONS ALERTES PRIX
========================= */
async function checkAndCreateNotifications(idProduit, ancienPrix, nouveauPrix) {
  try {
    const alertes = await query(
      `SELECT idAlerte, prixAuMomentAbonnement 
       FROM AlertePrix 
       WHERE idProduit = ? AND estActive = 1`,
      [idProduit]
    );

    for (const alerte of alertes) {
      if (nouveauPrix < alerte.prixAuMomentAbonnement) {
        await query(
          `INSERT INTO NotificationAlerte 
            (ancienPrix, nouveauPrix, dateNotification, estLue, idAlerte)
           VALUES (?, ?, NOW(), 0, ?)`,
          [ancienPrix, nouveauPrix, alerte.idAlerte]
        );
      }
    }
    console.log(`✅ ${alertes.length} notification(s) créée(s) pour produit ${idProduit}`);
  } catch (err) {
    console.error("checkAndCreateNotifications error:", err);
  }
}

/* =========================
   PRODUCT DETAIL
========================= */
app.get("/api/products/:id", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.description, p.prix, p.stock,
             p.image, p.marque, cat.nom AS categorie
      FROM produit p
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      WHERE p.idProduit = ? AND p.estDisponible = 1
    `, [req.params.id]);

    if (!rows.length) 
      return res.json({ success: false, message: "Produit introuvable" });
    
    const p = rows[0];
    const desc = parseDesc(p.description); // ← ajouter

    const avisRows = await query(`
      SELECT a.idAvis, u.prenom AS nom, a.note, a.commentaire, a.dateAvis
      FROM avis a
      LEFT JOIN utilisateur u ON u.idUtilisateur = a.idClient
      WHERE a.idProduit = ? AND a.estVisible = 1
      ORDER BY a.dateAvis DESC
      LIMIT 20
    `, [req.params.id]);

    const reviews = avisRows.map(r => ({
      idAvis: r.idAvis,
      name: r.nom || "Anonyme",
      stars: r.note,
      date: new Date(r.dateAvis).toLocaleDateString("fr-FR", { 
        day: "numeric", month: "long", year: "numeric" 
      }),
      text: r.commentaire,
      helpful: 0
    }));

    const qRows = await query(`
      SELECT q.idQuestion, q.texte AS question, q.dateQuestion,
             u.prenom AS auteur, q.reponse, q.dateReponse
      FROM question q
      LEFT JOIN utilisateur u ON u.idUtilisateur = q.idClient
      WHERE q.idProduit = ?
      ORDER BY q.dateQuestion DESC
      LIMIT 10
    `, [req.params.id]);

    const questions = qRows.map(r => ({
      q: r.question,
      a: r.reponse || null,
      author: r.reponse ? "Support DigitalStore" : r.auteur || "Anonyme",
      date: new Date(r.dateQuestion).toLocaleDateString("fr-FR", { 
        day: "numeric", month: "long", year: "numeric" 
      }),
      votes: 0
    }));

    const ratingData = await query(`
      SELECT COALESCE(AVG(note), 0) AS avg, COUNT(*) AS cnt
      FROM avis WHERE idProduit = ? AND estVisible = 1
    `, [req.params.id]);

    res.json({
      success: true,
      product: {
        id: p.idProduit,
        name: p.nom,
        cat: p.categorie || "Divers",
        price: Number(p.prix),
        oldPrice: desc.oldPrice,       // ← remplace null
        badge: desc.badge,             // ← remplace null
        stock: p.stock > 0,
        img: p.image || "",
        imgs: [p.image || ""],
        specs: desc.text,              // ← remplace p.description || ""
        desc: desc.text,               // ← remplace p.description || ""
        specItems: {},
        rating: Math.round(Number(ratingData[0]?.avg || 0) * 10) / 10,
        ratingCount: Number(ratingData[0]?.cnt || 0),
        reviews,
        questions
      }
    });
  } catch (err) {
    console.log("Product detail error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   SUBMIT REVIEW
========================= */
app.post("/api/reviews", async (req, res) => {
  const { idProduit, idUtilisateur, note, commentaire } = req.body;
  if (!idProduit || !note || !commentaire)
    return res.json({ success: false, message: "Champs manquants" });
  try {
    await query(
      `INSERT INTO avis (idProduit, idClient, note, commentaire, dateAvis, estVisible)
 VALUES (?, ?, ?, ?, NOW(), 0)`,
      [idProduit, idUtilisateur || null, note, commentaire]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Review error:", err);
    res.json({ success: false, message: "Erreur avis" });
  }
});

/* =========================
   SUBMIT QUESTION
========================= */
app.post("/api/questions", async (req, res) => {
  const { idProduit, idUtilisateur, contenu } = req.body;
  if (!idProduit || !contenu)
    return res.json({ success: false, message: "Champs manquants" });
  try {
    await query(
      `INSERT INTO question (idProduit, idClient, texte, dateQuestion, estRepondue)
       VALUES (?, ?, ?, NOW(), 0)`,
      [idProduit, idUtilisateur || null, contenu]
    );
    res.json({ success: true });
  } catch (err) {
    console.log("Question error:", err);
    res.json({ success: false, message: "Erreur question" });
  }
});

/* =========================
   CATEGORIES (public)
========================= */
app.get("/api/categories", async (req, res) => {
  try {
    const rows = await query(`
      SELECT cat.idCategorie, cat.nom, cat.icone,
             COUNT(p.idProduit) AS nbProduits
      FROM categorie cat
      LEFT JOIN produit p ON p.idCategorie = cat.idCategorie AND p.estDisponible = 1
      GROUP BY cat.idCategorie
      ORDER BY cat.nom
    `);
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.json({ success: false, categories: [] });
  }
});

/* =========================
   GET ALL USERS (Admin)
========================= */
app.get("/api/users", async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.idUtilisateur, u.nom, u.prenom, u.email, 
             u.telephone, u.typeUtilisateur, u.estActif,
             COALESCE(cf.pointsTotal, 0) AS pts
      FROM utilisateur u
      LEFT JOIN comptefidelite cf ON cf.idClient = u.idUtilisateur
      ORDER BY u.idUtilisateur DESC
    `);
    res.json({ success: true, users: rows });
  } catch (err) {
    res.json({ success: false, users: [] });
  }
});

/* =========================
   TOGGLE USER STATUS (Admin)
========================= */
app.put("/api/users/:id/status", async (req, res) => {
  const { estActif } = req.body;
  try {
    await query(
      "UPDATE utilisateur SET estActif=? WHERE idUtilisateur=?",
      [estActif ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Erreur mise à jour" });
  }
});

/* =========================
   ADMIN AUTH
========================= */
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Champs manquants" });

  try {
    const results = await query(
      `SELECT u.*, a.niveauAcces 
       FROM utilisateur u
       JOIN administrateur a ON a.idUtilisateur = u.idUtilisateur
       WHERE u.email = ? AND u.estActif = 1`,
      [email]
    );

    if (!results.length)
      return res.status(401).json({ success: false, message: "Identifiants admin invalides" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.motDePasse);

    if (!match)
      return res.status(401).json({ success: false, message: "Mot de passe incorrect" });

    const token = createAdminToken(email);
    return res.json({
      success: true,
      user: {
        id: user.idUtilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        niveauAcces: user.niveauAcces
      },
      token
    });
  } catch (err) {
    console.log("Admin login error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   ADMIN VERIFY TOKEN
========================= */
app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !adminSessions.has(token)) {
    return res.json({ success: false, message: "Token invalide" });
  }
  res.json({ success: true });
});

/* =========================
   ADMIN DATA API
========================= */
app.get("/api/admin/data", requireAdminAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT state_key, state_value FROM admin_state WHERE state_key IN (?)",
      [ADMIN_DATA_KEYS]
    );
    const data = {};
    for (const row of rows) {
      try { data[row.state_key] = JSON.parse(row.state_value); }
      catch { data[row.state_key] = row.state_value; }
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur chargement admin" });
  }
});

app.put("/api/admin/data/:key", requireAdminAuth, async (req, res) => {
  const { key } = req.params;
  if (!ADMIN_DATA_KEYS.includes(key))
    return res.status(400).json({ success: false, message: "Clé inconnue" });
  try {
    const payload = JSON.stringify(req.body?.value ?? null);
    await query(
      `INSERT INTO admin_state (state_key, state_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
      [key, payload]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur sauvegarde admin" });
  }
});

/* =========================
   REDEEM REWARD (Points fidélité)
========================= */
app.post("/api/loyalty/redeem", async (req, res) => {
  const { idClient, rewardId, pointsCost } = req.body;
  if (!idClient || !rewardId || !pointsCost)
    return res.json({ success: false, message: "Données manquantes" });

  try {
    const rows = await query(
      "SELECT pointsTotal FROM comptefidelite WHERE idClient = ?",
      [idClient]
    );
    if (!rows.length)
      return res.json({ success: false, message: "Compte fidélité introuvable" });

    if (rows[0].pointsTotal < pointsCost)
      return res.json({ success: false, message: "Points insuffisants" });

    await query(
      "UPDATE comptefidelite SET pointsTotal = pointsTotal - ?, dateMAJ = NOW() WHERE idClient = ?",
      [pointsCost, idClient]
    );

    const logKey = "reward_log";
    let logs = [];
    try {
      const existing = await query(
        "SELECT state_value FROM admin_state WHERE state_key = ?",
        [logKey]
      );
      if (existing.length) logs = JSON.parse(existing[0].state_value);
    } catch(_) {}

    logs.unshift({ idClient, rewardId, pointsCost, date: new Date().toISOString() });
    logs = logs.slice(0, 200);

    await query(
      `INSERT INTO admin_state (state_key, state_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), updated_at = CURRENT_TIMESTAMP`,
      [logKey, JSON.stringify(logs)]
    );

    const updated = await query(
      "SELECT pointsTotal FROM comptefidelite WHERE idClient = ?",
      [idClient]
    );

    res.json({ success: true, newPoints: updated[0]?.pointsTotal || 0 });
  } catch (err) {
    console.log("Redeem error:", err);
    res.json({ success: false, message: "Erreur serveur" });
  }
});

/* =========================
   GET LOYALTY POINTS
========================= */
app.get("/api/loyalty/:idClient", async (req, res) => {
  try {
    const rows = await query(
      `SELECT cf.pointsTotal, nf.libelle AS niveau
       FROM comptefidelite cf
       LEFT JOIN niveaufidelite nf ON nf.idNiveau = cf.idNiveau
       WHERE cf.idClient = ?`,
      [req.params.idClient]
    );
    if (!rows.length)
      return res.json({ success: false, points: 0 });

    res.json({ success: true, points: rows[0].pointsTotal, niveau: rows[0].niveau });
  } catch (err) {
    res.json({ success: false, points: 0 });
  }
});





app.post("/api/loyalty/assign", async (req, res) => {
  const { idClient, points } = req.body;
  if (!idClient || !points) return res.json({ success: false, message: "Données manquantes" });
  try {
    await query(
      `INSERT INTO comptefidelite (pointsTotal, dateMAJ, idClient, idNiveau)
       VALUES (?, NOW(), ?, 1)
       ON DUPLICATE KEY UPDATE pointsTotal = pointsTotal + ?, dateMAJ = NOW()`,
      [points, idClient, points]
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});




/* =========================
   COORDONNÉES WILAYAS
========================= */
const WILAYA_COORDS = {
  "Adrar":{"lat":27.87,"lng":0.29},   "Chlef":{"lat":36.17,"lng":1.33},
  "Laghouat":{"lat":33.80,"lng":2.87},"Oum el Bouaghi":{"lat":35.88,"lng":7.11},
  "Batna":{"lat":35.56,"lng":6.17},   "Béjaïa":{"lat":36.75,"lng":5.08},
  "Biskra":{"lat":34.85,"lng":5.73},  "Béchar":{"lat":31.62,"lng":-2.22},
  "Blida":{"lat":36.47,"lng":2.82},   "Bouira":{"lat":36.38,"lng":3.90},
  "Tamanrasset":{"lat":22.79,"lng":5.52},"Tébessa":{"lat":35.40,"lng":8.12},
  "Tlemcen":{"lat":34.88,"lng":-1.32},"Tiaret":{"lat":35.37,"lng":1.32},
  "Tizi Ouzou":{"lat":36.72,"lng":4.05},"Alger":{"lat":36.74,"lng":3.06},
  "Djelfa":{"lat":34.67,"lng":3.26},  "Jijel":{"lat":36.82,"lng":5.77},
  "Sétif":{"lat":36.19,"lng":5.41},   "Saïda":{"lat":34.83,"lng":0.15},
  "Skikda":{"lat":36.88,"lng":6.90},  "Sidi Bel Abbès":{"lat":35.19,"lng":-0.63},
  "Annaba":{"lat":36.90,"lng":7.76},  "Guelma":{"lat":36.46,"lng":7.43},
  "Constantine":{"lat":36.37,"lng":6.61},"Médéa":{"lat":36.27,"lng":2.75},
  "Mostaganem":{"lat":35.93,"lng":0.09},"M'Sila":{"lat":35.70,"lng":4.54},
  "Mascara":{"lat":35.40,"lng":0.14}, "Ouargla":{"lat":31.95,"lng":5.32},
  "Oran":{"lat":35.69,"lng":-0.63},   "El Bayadh":{"lat":33.68,"lng":1.02},
  "Illizi":{"lat":26.49,"lng":8.47},  "Bordj Bou Arréridj":{"lat":36.07,"lng":4.76},
  "Boumerdès":{"lat":36.76,"lng":3.48},"El Tarf":{"lat":36.77,"lng":8.31},
  "Tindouf":{"lat":27.67,"lng":-8.15},"Tissemsilt":{"lat":35.60,"lng":1.81},
  "El Oued":{"lat":33.37,"lng":6.86}, "Khenchela":{"lat":35.44,"lng":7.14},
  "Souk Ahras":{"lat":36.28,"lng":7.95},"Tipaza":{"lat":36.59,"lng":2.44},
  "Mila":{"lat":36.45,"lng":6.26},    "Aïn Defla":{"lat":36.27,"lng":1.97},
  "Naâma":{"lat":33.27,"lng":-0.31},  "Aïn Témouchent":{"lat":35.30,"lng":-1.14},
  "Ghardaïa":{"lat":32.49,"lng":3.67},"Relizane":{"lat":35.74,"lng":0.56}
};

app.get("/api/wilayas/coords", (req, res) => {
  res.json({ success: true, wilayas: WILAYA_COORDS, depot: { lat:36.75, lng:5.08, city:"Béjaïa" } });
});

/* =========================
   GÉNÉRATION CODE PROMO
========================= */
app.post("/api/promo/generate", async (req, res) => {
  const { idClient, rewardId } = req.body;
  if (!idClient || !rewardId)
    return res.json({ success: false, message: "Données manquantes" });

  const REWARD_CONFIG = {
    disc5:    { typeReduction: "percent",  taux: 5,    prefix: "FIDE5",  days: 30  },
    delivery: { typeReduction: "delivery", taux: 0,    prefix: "LIVEXP", days: 60  },
    disc50k:  { typeReduction: "fixed",    taux: 5000, prefix: "GOLD5K", days: 30  },
    vip:      { typeReduction: "vip",      taux: 10,   prefix: "VIP10",  days: 365 }
  };

  const cfg = REWARD_CONFIG[rewardId];
  if (!cfg) return res.json({ success: false, message: "Récompense inconnue" });

  try {
    const existing = await query(
      `SELECT codePromo FROM promotion
       WHERE idClientOwner = ? AND rewardId = ?
         AND estUtilise = 0 AND dateFin > NOW() AND estActive = 1`,
      [idClient, rewardId]
    );
    if (existing.length) {
      return res.json({ success: true, code: existing[0].codePromo, already: true });
    }

    const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const code   = `${cfg.prefix}-${suffix}`;
    const now    = new Date();
    const expiry = new Date(Date.now() + cfg.days * 86400000);
    const fmt    = d => d.toISOString().slice(0, 19).replace("T", " ");

    await query(
      `INSERT INTO Promotion
         (titre, codePromo, typeReduction, tauxReduction,
          dateDebut, dateFin, estActive,
          idClientOwner, rewardId, estUtilise)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0)`,
      [
        `Récompense fidélité — ${rewardId}`,
        code, cfg.typeReduction, cfg.taux,
        fmt(now), fmt(expiry),
        idClient, rewardId
      ]
    );

    res.json({ success: true, code, expiry: expiry.toISOString() });
  } catch (err) {
    console.log("Generate promo error:", err);
    res.json({ success: false, message: "Erreur génération code" });
  }
});

/* =========================
   VÉRIFICATION CODE PROMO
========================= */
app.post("/api/promo/verify", async (req, res) => {
  const { code, idClient, montantPanier } = req.body;
  if (!code) return res.json({ success: false, message: "Code manquant" });

  try {
    const rows = await query(
      `SELECT * FROM Promotion
       WHERE codePromo = UPPER(?)
         AND estActive  = 1
         AND estUtilise = 0
         AND dateFin    > NOW()`,
      [code.toUpperCase()]
    );

    if (!rows.length)
      return res.json({ success: false, message: "Code invalide ou expiré" });

    const promo = rows[0];

    if (promo.idClientOwner !== null && idClient && promo.idClientOwner !== idClient) {
      return res.json({ success: false, message: "Ce code ne vous appartient pas" });
    }

    const montant = parseFloat(montantPanier) || 0;
    let reduction = 0;
    let label     = "";

    switch (promo.typeReduction) {
      case "percent":
        reduction = Math.round(montant * promo.tauxReduction / 100);
        label     = `−${promo.tauxReduction}% (${promo.titre})`;
        break;
      case "fixed":
        reduction = Math.min(promo.tauxReduction, montant);
        label     = `−${Number(promo.tauxReduction).toLocaleString("fr-DZ")} DA (${promo.titre})`;
        break;
      case "delivery":
        reduction = 0;
        label     = "Livraison express offerte";
        break;
      case "vip":
        reduction = Math.round(montant * promo.tauxReduction / 100);
        label     = `−${promo.tauxReduction}% VIP Diamond`;
        break;
      default:
        reduction = Math.round(montant * (promo.tauxReduction || 0) / 100);
        label     = promo.titre || "Promotion";
    }

    res.json({
      success:     true,
      type:        promo.typeReduction,
      valeur:      promo.tauxReduction,
      reduction,
      label,
      idPromotion: promo.idPromotion
    });
  } catch (err) {
    console.log("Verify promo error:", err);
    res.json({ success: false, message: "Erreur vérification code" });
  }
});

/* =========================
   MARQUER CODE UTILISÉ
========================= */
app.put("/api/promo/use", async (req, res) => {
  const { code, idCommande } = req.body;
  console.log("PROMO USE →", code, idCommande); // ← ajouter
  if (!code) return res.json({ success: false });
  try {
    const result = await query(
      `UPDATE promotion
       SET estUtilise = 1, dateUtilisation = NOW(), idCommandeUsed = ?
       WHERE codePromo = UPPER(?) AND estUtilise = 0`,
      [idCommande || null, code]
    );
    console.log("PROMO USE affected:", result.affectedRows); // ← ajouter
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

/* =========================
   CODES ACTIFS D'UN CLIENT
========================= */
app.get("/api/promo/client/:idClient", async (req, res) => {
  try {
    const rows = await query(
      `SELECT codePromo, typeReduction, tauxReduction, rewardId,
              dateDebut, dateFin, estUtilise, titre
       FROM Promotion
       WHERE idClientOwner = ?
       ORDER BY dateDebut DESC
       LIMIT 20`,
      [req.params.idClient]
    );
    res.json({ success: true, codes: rows });
  } catch (err) {
    res.json({ success: false, codes: [] });
  }
});

/* =========================
   PANIER — GET
========================= */
app.get("/api/cart/:idClient", async (req, res) => {
  try {
    let panierRows = await query(
      "SELECT idPanier FROM panier WHERE idClient=?",
      [req.params.idClient]
    );

    if (!panierRows.length) {
      await query(
        "INSERT INTO panier (dateCreation, idClient) VALUES (NOW(), ?)",
        [req.params.idClient]
      );
      panierRows = await query(
        "SELECT idPanier FROM panier WHERE idClient=?",
        [req.params.idClient]
      );
    }

    if (!panierRows.length) {
      return res.json({ success: false, message: "Panier introuvable" });
    }

    const idPanier = panierRows[0].idPanier;

    const rows = await query(`
      SELECT lp.idProduit AS id, lp.quantite AS qty, lp.prixUnitaire AS price,
             p.nom AS name, p.image AS img, cat.nom AS cat
      FROM lignepanier lp
      JOIN produit p ON p.idProduit = lp.idProduit
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      WHERE lp.idPanier = ?
    `, [idPanier]);

    res.json({ success: true, items: rows });
  } catch (err) {
    console.error("Get cart error:", err.message);
    res.json({ success: false, items: [] });
  }
});

/* =========================
   PANIER — PUT (sync)
========================= */
app.put("/api/cart/:idClient", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.json({ success: false, message: "Items doit être un tableau" });
  }
  try {
    let panierRows = await query(
      "SELECT idPanier FROM panier WHERE idClient=?",
      [req.params.idClient]
    );
    if (!panierRows.length) {
      await query(
        "INSERT INTO panier (dateCreation, idClient) VALUES (NOW(), ?)",
        [req.params.idClient]
      );
      panierRows = await query(
        "SELECT idPanier FROM panier WHERE idClient=?",
        [req.params.idClient]
      );
    }
    const idPanier = panierRows[0].idPanier;
    await query("DELETE FROM lignepanier WHERE idPanier=?", [idPanier]);
    for (const item of items) {
      if (!item.idProduit || !item.quantite || item.quantite <= 0) continue;
      await query(
        "INSERT INTO lignepanier (quantite, prixUnitaire, idPanier, idProduit) VALUES (?, ?, ?, ?)",
        [item.quantite, item.prixUnitaire || 0, idPanier, item.idProduit]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Sync cart error:", err.message);
    res.json({ success: false, message: err.message });
  }
});

/* =========================
   GESTION DES AVIS (Admin)
========================= */
app.get("/api/admin/reviews", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        a.idAvis, a.note, a.commentaire, a.dateAvis, a.estVisible,
        p.nom AS nomProduit, p.idProduit,
        u.prenom AS prenomClient, u.nom AS nomClient, u.email AS emailClient
      FROM avis a
      LEFT JOIN produit p ON p.idProduit = a.idProduit
      LEFT JOIN utilisateur u ON u.idUtilisateur = a.idClient
      ORDER BY a.dateAvis DESC
    `);
    const reviews = rows.map(r => ({
      id: r.idAvis,
      note: r.note,
      commentaire: r.commentaire,
      date: new Date(r.dateAvis).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }),
      estVisible: r.estVisible === 1,
      produit: { id: r.idProduit, nom: r.nomProduit || "Produit supprimé" },
      client: {
        nom: ((r.prenomClient || '') + ' ' + (r.nomClient || '')).trim() || "Anonyme",
        email: r.emailClient || ""
      }
    }));
    res.json({ success: true, reviews });
  } catch (err) {
    res.json({ success: false, reviews: [] });
  }
});

app.put("/api/admin/reviews/:id/approve", async (req, res) => {
  try {
    await query("UPDATE avis SET estVisible = 1 WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis approuvé" });
  } catch (err) {
    res.json({ success: false, message: "Erreur approbation" });
  }
});

app.put("/api/admin/reviews/:id/hide", async (req, res) => {
  try {
    await query("UPDATE avis SET estVisible = 0 WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis masqué" });
  } catch (err) {
    res.json({ success: false, message: "Erreur masquage" });
  }
});

app.delete("/api/admin/reviews/:id", async (req, res) => {
  try {
    await query("DELETE FROM avis WHERE idAvis = ?", [req.params.id]);
    res.json({ success: true, message: "Avis supprimé" });
  } catch (err) {
    res.json({ success: false, message: "Erreur suppression" });
  }
});

/* =========================
   GESTION DES QUESTIONS (Admin)
========================= */
app.get("/api/admin/questions", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        q.idQuestion, q.texte, q.reponse, q.dateQuestion, q.dateReponse, q.estRepondue,
        p.nom AS nomProduit, p.idProduit,
        u.prenom AS prenomClient, u.nom AS nomClient
      FROM question q
      LEFT JOIN produit p ON p.idProduit = q.idProduit
      LEFT JOIN utilisateur u ON u.idUtilisateur = q.idClient
      ORDER BY q.estRepondue ASC, q.dateQuestion DESC
    `);

    const questions = rows.map(r => ({
      id: r.idQuestion,
      texte: r.texte,
      reponse: r.reponse || null,
      dateQuestion: new Date(r.dateQuestion).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }),
      dateReponse: r.dateReponse ? new Date(r.dateReponse).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric"
      }) : null,
      estRepondue: r.estRepondue === 1,
      produit: { id: r.idProduit, nom: r.nomProduit || "Produit supprimé" },
      client: { nom: ((r.prenomClient || '') + ' ' + (r.nomClient || '')).trim() || "Anonyme" }
    }));

    res.json({ success: true, questions });
  } catch (err) {
    console.log("Admin questions error:", err);
    res.json({ success: false, questions: [] });
  }
});

app.put("/api/admin/questions/:id/reponse", async (req, res) => {
  const { reponse } = req.body;
  if (!reponse || reponse.trim() === "")
    return res.json({ success: false, message: "Réponse vide" });
  try {
    await query(
      `UPDATE question 
       SET reponse = ?, dateReponse = NOW(), estRepondue = 1
       WHERE idQuestion = ?`,
      [reponse.trim(), req.params.id]
    );
    res.json({ success: true, message: "Réponse enregistrée" });
  } catch (err) {
    res.json({ success: false, message: "Erreur réponse" });
  }
});

app.delete("/api/admin/questions/:id", async (req, res) => {
  try {
    await query("DELETE FROM question WHERE idQuestion = ?", [req.params.id]);
    res.json({ success: true, message: "Question supprimée" });
  } catch (err) {
    res.json({ success: false, message: "Erreur suppression" });
  }
});

/* =========================
   STATISTIQUES ADMIN (unique, sans doublon)
========================= */
app.get("/api/admin/stats", async (req, res) => {
  try {
    const [ca] = await query(
      `SELECT COALESCE(SUM(montantTotal), 0) AS total FROM commande WHERE LOWER(statut) NOT IN ('annulé', 'annule', 'cancelled')`
    );
    const [nbCommandes] = await query(`SELECT COUNT(*) AS total FROM commande`);
    const [nbClients]   = await query(`SELECT COUNT(*) AS total FROM client`);
    const [nbProduits]  = await query(`SELECT COUNT(*) AS total FROM produit WHERE estDisponible = 1`);

    const ventesParMois = await query(`
      SELECT 
        DATE_FORMAT(dateCommande, '%Y-%m') AS mois,
        COUNT(*) AS nbCommandes,
        COALESCE(SUM(montantTotal), 0) AS ca
      FROM commande
      WHERE dateCommande >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND statut != 'annulé'
      GROUP BY mois
      ORDER BY mois ASC
    `);

    const ventesParCategorie = await query(`
      SELECT 
        c.nom AS categorie,
        COUNT(lc.idLigne) AS nbVentes,
        COALESCE(SUM(lc.prixUnitaire * lc.quantite), 0) AS ca
      FROM lignecommande lc
      JOIN produit p ON p.idProduit = lc.idProduit
      JOIN categorie c ON c.idCategorie = p.idCategorie
      GROUP BY c.idCategorie
      ORDER BY ca DESC
    `);

    const topProduits = await query(`
      SELECT 
        p.nom, p.prix,
        SUM(lc.quantite) AS qteTotale,
        SUM(lc.prixUnitaire * lc.quantite) AS ca
      FROM lignecommande lc
      JOIN produit p ON p.idProduit = lc.idProduit
      GROUP BY p.idProduit
      ORDER BY qteTotale DESC
      LIMIT 5
    `);

    const commandesParStatut = await query(`
      SELECT statut, COUNT(*) AS nb FROM commande GROUP BY statut
    `);

    const [nouveauxClients] = await query(`
      SELECT COUNT(*) AS total FROM utilisateur
      WHERE typeUtilisateur = 'client'
        AND MONTH(dateInscription) = MONTH(NOW())
        AND YEAR(dateInscription) = YEAR(NOW())
    `);

    const [avisEnAttente] = await query(`
      SELECT COUNT(*) AS nb FROM avis WHERE estVisible = 0
    `);

    res.json({
      success: true,
      stats: {
        caTotal: ca.total,
        nbCommandes: nbCommandes.total,
        nbClients: nbClients.total,
        nbProduits: nbProduits.total,
        nouveauxClients: nouveauxClients.total,
        avisEnAttente: avisEnAttente.nb,
        ventesParMois,
        ventesParCategorie,
        topProduits,
        commandesParStatut
      }
    });
  } catch (err) {
    console.log("Stats error:", err);
    res.json({ success: false, stats: {} });
  }
});

/* =========================
   GESTION DES CATÉGORIES (Admin) — version unique
========================= */
app.get("/api/admin/categories", async (req, res) => {
  try {
    const rows = await query(`
      SELECT c.idCategorie, c.nom, c.description, c.icone,
             COUNT(p.idProduit) AS nbProduits
      FROM categorie c
      LEFT JOIN produit p ON p.idCategorie = c.idCategorie
      GROUP BY c.idCategorie
      ORDER BY c.nom ASC
    `);
    res.json({ success: true, categories: rows });
  } catch (err) {
    res.json({ success: false, categories: [] });
  }
});

app.post("/api/admin/categories", async (req, res) => {
  const { nom, description, icone } = req.body;
  if (!nom || nom.trim() === "")
    return res.status(400).json({ success: false, message: "Nom obligatoire" });
  try {
    const result = await query(
      "INSERT INTO categorie (nom, description, icone) VALUES (?, ?, ?)",
      [nom.trim(), description || "", icone || "📦"]
    );
    res.json({ success: true, idCategorie: result.insertId, message: "Catégorie créée" });
  } catch (err) {
    console.log("Add category error:", err);
    res.status(500).json({ success: false, message: "Erreur création catégorie" });
  }
});

app.put("/api/admin/categories/:id", async (req, res) => {
  const { nom, description, icone } = req.body;
  if (!nom || nom.trim() === "")
    return res.status(400).json({ success: false, message: "Nom obligatoire" });
  try {
    await query(
      "UPDATE categorie SET nom=?, description=?, icone=? WHERE idCategorie=?",
      [nom.trim(), description || "", icone || "📦", req.params.id]
    );
    res.json({ success: true, message: "Catégorie modifiée" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur modification catégorie" });
  }
});

app.delete("/api/admin/categories/:id", async (req, res) => {
  try {
    // Vérifier si des produits utilisent cette catégorie
    const prods = await query(
      "SELECT COUNT(*) AS nb FROM produit WHERE idCategorie=?",
      [req.params.id]
    );
    if (prods[0].nb > 0) {
      // Détacher les produits plutôt que de bloquer
      await query(
        "UPDATE produit SET idCategorie = NULL WHERE idCategorie = ?",
        [req.params.id]
      );
    }
    await query("DELETE FROM categorie WHERE idCategorie=?", [req.params.id]);
    res.json({ success: true, message: "Catégorie supprimée" });
  } catch (err) {
    console.log("Delete category error:", err);
    res.status(500).json({ success: false, message: "Erreur suppression catégorie: " + err.message });
  }
});

/* =========================
   GESTION DES PROMOTIONS (Admin)
========================= */
app.get("/api/admin/promotions", async (req, res) => {
  try {
    const rows = await query(`
      SELECT idPromotion, titre, codePromo, typeReduction, tauxReduction,
             dateDebut, dateFin, estActive,
             COALESCE(estUtilise, 0) AS estUtilise,
             idClientOwner
      FROM Promotion
      WHERE idClientOwner IS NULL
      ORDER BY dateDebut DESC
    `);
    res.json({ success: true, promotions: rows });
  } catch (err) {
    console.log("Admin promotions error:", err);
    res.status(500).json({ success: false, message: "Erreur chargement promotions" });
  }
});

app.post("/api/admin/promotions", async (req, res) => {
  const { titre, codePromo, typeReduction, tauxReduction, dateDebut, dateFin } = req.body;
  if (!titre || !codePromo || !typeReduction || tauxReduction == null || !dateDebut || !dateFin)
    return res.status(400).json({ success: false, message: "Tous les champs sont obligatoires" });
  try {
    const existing = await query(
      "SELECT idPromotion FROM Promotion WHERE codePromo = UPPER(?)", [codePromo]
    );
    if (existing.length)
      return res.status(409).json({ success: false, message: "Ce code promo existe déjà" });

    const result = await query(
      `INSERT INTO promotion (titre, codePromo, typeReduction, tauxReduction, dateDebut, dateFin, estActive)
       VALUES (?, UPPER(?), ?, ?, ?, ?, 1)`,
      [titre, codePromo, typeReduction, parseFloat(tauxReduction), dateDebut, dateFin]
    );
    res.json({ success: true, idPromotion: result.insertId, message: "Promotion créée" });
  } catch (err) {
    console.log("Create promotion error:", err);
    res.status(500).json({ success: false, message: "Erreur création promotion" });
  }
});

app.put("/api/admin/promotions/:id/toggle", async (req, res) => {
  try {
    await query(
      "UPDATE Promotion SET estActive = NOT estActive WHERE idPromotion = ?",
      [req.params.id]
    );
    res.json({ success: true, message: "Statut promotion modifié" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur toggle promotion" });
  }
});

app.delete("/api/admin/promotions/:id", async (req, res) => {
  try {
    await query("DELETE FROM promotion WHERE idPromotion = ? AND idClientOwner IS NULL", [req.params.id]);
    res.json({ success: true, message: "Promotion supprimée" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur suppression promotion" });
  }
});

/* =========================
   GESTION DES LIVRAISONS (Admin) — version unique
========================= */
app.get("/api/admin/livraisons", async (req, res) => {
  try {
    const rows = await query(`
      SELECT 
        l.idLivraison, l.statut AS statutLivraison,
        l.adresse, l.wilaya,
        l.dateEstimee, l.dateEffective, l.fraisLivraison,
        c.idCommande, c.idClient, c.statut AS statutCommande,
        c.montantTotal, c.dateCommande,
        u.prenom AS prenomClient, u.nom AS nomClient,
        u.email, u.telephone
      FROM livraison l
      JOIN commande c ON c.idCommande = l.idCommande
      JOIN utilisateur u ON u.idUtilisateur = c.idClient
      ORDER BY c.dateCommande DESC
    `);

    const livraisons = rows.map(r => ({
      id: r.idLivraison,
      statut: r.statutLivraison || r.statutCommande,
      adresse: r.adresse,
      wilaya: r.wilaya,
      dateEstimee: r.dateEstimee,
      dateEffective: r.dateEffective,
      frais: Number(r.fraisLivraison) || 0,
      commande: {
        id: "DS-" + r.idCommande,
        total: Number(r.montantTotal),
        date: new Date(r.dateCommande).toLocaleDateString("fr-FR")
      },
      client: {
        nom: ((r.prenomClient || '') + " " + (r.nomClient || '')).trim() || r.email || 'Client #' + r.idClient,
        email: r.email,
        tel: r.telephone
      }
    }));

    res.json({ success: true, livraisons });
  } catch (err) {
    console.log("Admin livraisons error:", err);
    res.json({ success: false, livraisons: [] });
  }
});

app.post("/api/admin/livraisons", async (req, res) => {
  const { idCommande, adresse, wilaya, fraisLivraison, dateEstimee } = req.body;
  if (!idCommande)
    return res.json({ success: false, message: "idCommande manquant" });
  try {
    const existing = await query(
      "SELECT idLivraison FROM livraison WHERE idCommande = ?",
      [idCommande]
    );
    if (existing.length)
      return res.json({ success: false, message: "Livraison déjà créée" });

    await query(
      `INSERT INTO livraison 
        (statut, adresse, wilaya, dateEstimee, fraisLivraison, idCommande)
       VALUES ('En préparation', ?, ?, ?, ?, ?)`,
      [adresse || "", wilaya || "", dateEstimee || null, fraisLivraison || 0, idCommande]
    );

    await query(
      "UPDATE commande SET statut = 'en préparation' WHERE idCommande = ?",
      [idCommande]
    );

    res.json({ success: true, message: "Livraison créée" });
  } catch (err) {
    console.log("Create livraison error:", err);
    res.json({ success: false, message: "Erreur création livraison" });
  }
});

app.put("/api/admin/livraisons/:id/statut", async (req, res) => {
  const { statut } = req.body;
  if (!statut) return res.json({ success: false, message: "Statut manquant" });

  const STATUTS_VALIDES = ["En préparation", "Expédié", "En transit", "Livré", "Échec livraison"];
  if (!STATUTS_VALIDES.includes(statut))
    return res.json({ success: false, message: "Statut invalide" });

  const STATUT_LABELS = {
    "En préparation": { desc: "Votre commande est en cours de préparation.", loc: "Entrepôt DigitalStore" },
    "Expédié":        { desc: "Votre colis a quitté notre entrepôt.",         loc: "Centre de tri Béjaïa" },
    "En transit":     { desc: "Le colis est en transit vers votre wilaya.",    loc: "En transit" },
    "Livré":          { desc: "Votre colis a été livré avec succès.",          loc: "Adresse de livraison" },
    "Échec livraison":{ desc: "La livraison n'a pas pu être effectuée.",       loc: "Retour entrepôt" }
  };

  try {
    // Toujours mettre à jour le statut de la livraison
    await query(
      "UPDATE livraison SET statut=? WHERE idLivraison=?",
      [statut, req.params.id]
    );

    // Insérer automatiquement une étape dans suivilivraison
    const lbl = STATUT_LABELS[statut] || { desc: statut, loc: "" };
    await query(
      `INSERT INTO suivilivraison (statut, localisation, description, dateEtape, idLivraison)
       VALUES (?, ?, ?, NOW(), ?)`,
      [statut, lbl.loc, lbl.desc, req.params.id]
    ).catch(e => console.warn("suivilivraison insert warn:", e.message));

    // Si livré → dateEffective + confirmer paiement COD
    if (statut === "Livré") {
      await query(
        "UPDATE livraison SET dateEffective=NOW() WHERE idLivraison=?",
        [req.params.id]
      );

      const cmdRows = await query(
        "SELECT idCommande FROM livraison WHERE idLivraison = ?",
        [req.params.id]
      );
      if (cmdRows.length) {
        const idCmd = cmdRows[0].idCommande;
        const payRows = await query(
          "SELECT idPaiement FROM paiement WHERE idCommande = ? AND typePaiement = 'cod'",
          [idCmd]
        );
        if (payRows.length) {
          await query(
            "UPDATE PaiementLivraison SET confirmeParLivreur = 1 WHERE idPaiement = ?",
            [payRows[0].idPaiement]
          );
          await query(
            "UPDATE paiement SET statut = 'payé' WHERE idPaiement = ?",
            [payRows[0].idPaiement]
          );
        }
      }
    }

    // Mettre à jour le statut de la commande en cascade
    const rows = await query(
      "SELECT idCommande FROM livraison WHERE idLivraison = ?",
      [req.params.id]
    );
    if (rows.length) {
      const statutMap = {
        "En préparation": "en préparation",
        "Expédié":        "expédié",
        "En transit":     "expédié",
        "Livré":          "livré",
        "Échec livraison":"annulé"
      };
      await query(
        "UPDATE commande SET statut = ? WHERE idCommande = ?",
        [statutMap[statut] || statut.toLowerCase(), rows[0].idCommande]
      );
    }

    res.json({ success: true, message: "Statut mis à jour" });
  } catch (err) {
    console.log("Update livraison error:", err);
    res.json({ success: false, message: "Erreur mise à jour" });
  }
});

app.get("/api/admin/livraisons/:id/suivi", async (req, res) => {
  try {
    const rows = await query(
      `SELECT idSuivi, statut, localisation, description, dateEtape
       FROM suivilivraison
       WHERE idLivraison = ?
       ORDER BY dateEtape ASC`,
      [req.params.id]
    );
    res.json({ success: true, suivi: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur chargement suivi" });
  }
});

app.post("/api/admin/livraisons/:id/suivi", async (req, res) => {
  const { statut, localisation, description } = req.body;
  if (!statut) return res.status(400).json({ success: false, message: "Statut obligatoire" });
  try {
    await query(
      `INSERT INTO suivilivraison (statut, localisation, description, dateEtape, idLivraison)
       VALUES (?, ?, ?, NOW(), ?)`,
      [statut, localisation || "", description || "", req.params.id]
    );
    await query(
      "UPDATE livraison SET statut=? WHERE idLivraison=?",
      [statut, req.params.id]
    );
    res.json({ success: true, message: "Étape de suivi ajoutée" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur ajout suivi" });
  }
});

/* =========================
   ALERTES PRIX
========================= */
app.post("/api/alerts", async (req, res) => {
  const { idClient, idProduit } = req.body;
  if (!idClient || !idProduit)
    return res.json({ success: false, message: "Données manquantes" });

  try {
    const prodRows = await query(
      "SELECT prix FROM produit WHERE idProduit = ?",
      [idProduit]
    );
    if (!prodRows.length)
      return res.json({ success: false, message: "Produit introuvable" });

    const prixActuel = prodRows[0].prix;

    const existing = await query(
      `SELECT idAlerte FROM AlertePrix 
       WHERE idClient = ? AND idProduit = ? AND estActive = 1`,
      [idClient, idProduit]
    );
    if (existing.length)
      return res.json({ success: false, message: "Alerte déjà active" });

    await query(
      `INSERT INTO AlertePrix 
        (prixAuMomentAbonnement, dateActivation, estActive, idClient, idProduit)
       VALUES (?, NOW(), 1, ?, ?)`,
      [prixActuel, idClient, idProduit]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Alert create error:", err);
    res.json({ success: false, message: "Erreur création alerte" });
  }
});

app.delete("/api/alerts", async (req, res) => {
  const { idClient, idProduit } = req.body;
  try {
    await query(
      `UPDATE AlertePrix SET estActive = 0 
       WHERE idClient = ? AND idProduit = ?`,
      [idClient, idProduit]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});




/* =========================
   FAVORIS
========================= */
app.get("/api/favoris/:idClient", async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.idProduit, p.nom, p.prix, p.image, p.stock,
             p.marque, cat.nom AS categorie,
             COALESCE(AVG(a.note), 0) AS rating
      FROM favoris f
      JOIN produit p ON p.idProduit = f.idProduit
      LEFT JOIN categorie cat ON cat.idCategorie = p.idCategorie
      LEFT JOIN avis a ON a.idProduit = p.idProduit AND a.estVisible = 1
      WHERE f.idClient = ? AND p.estDisponible = 1
      GROUP BY p.idProduit
      ORDER BY f.dateAjout DESC
    `, [req.params.idClient]);
    res.json({ success: true, favoris: rows });
  } catch(err) {
    res.json({ success: false, favoris: [] });
  }
});

app.post("/api/favoris", async (req, res) => {
  const { idClient, idProduit } = req.body;
  if (!idClient || !idProduit)
    return res.json({ success: false, message: "Données manquantes" });
  try {
    await query(
      `INSERT IGNORE INTO favoris (idClient, idProduit, dateAjout)
       VALUES (?, ?, NOW())`,
      [idClient, idProduit]
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

app.delete("/api/favoris", async (req, res) => {
  const { idClient, idProduit } = req.body;
  if (!idClient || !idProduit)
    return res.json({ success: false, message: "Données manquantes" });
  try {
    await query(
      "DELETE FROM favoris WHERE idClient = ? AND idProduit = ?",
      [idClient, idProduit]
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false, message: err.message });
  }
});

app.get("/api/favoris/:idClient/:idProduit", async (req, res) => {
  try {
    const rows = await query(
      "SELECT 1 FROM favoris WHERE idClient = ? AND idProduit = ?",
      [req.params.idClient, req.params.idProduit]
    );
    res.json({ success: true, isFavori: rows.length > 0 });
  } catch(err) {
    res.json({ success: false, isFavori: false });
  }
});










/* =========================
   NOTIFICATIONS
========================= */
app.get("/api/notifications/:idClient", async (req, res) => {
  try {
    const rows = await query(
      `SELECT n.idNotification, n.ancienPrix, n.nouveauPrix, 
              n.dateNotification, n.estLue,
              p.nom AS nomProduit, p.image, p.idProduit
       FROM NotificationAlerte n
       JOIN AlertePrix a ON a.idAlerte = n.idAlerte
       JOIN produit p ON p.idProduit = a.idProduit
       WHERE a.idClient = ?
       ORDER BY n.dateNotification DESC
       LIMIT 20`,
      [req.params.idClient]
    );
    res.json({ success: true, notifications: rows });
  } catch (err) {
    res.json({ success: false, notifications: [] });
  }
});

app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    await query(
      "UPDATE NotificationAlerte SET estLue = 1 WHERE idNotification = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});



app.get("/api/reco/config", async (req, res) => {
  try {
    const rows = await query(
      "SELECT state_value FROM admin_state WHERE state_key = 'reco'"
    );
    const config = rows.length ? JSON.parse(rows[0].state_value) : [];
    res.json({ success: true, config });
  } catch(err) {
    res.json({ success: true, config: [] });
  }
});






/* =========================
   START SERVER
========================= */
app.listen(3000, () => {
  console.log("🚀 Serveur lancé sur http://localhost:3000");
  console.log("📦 Boutique  → http://localhost:3000/FenetrePrincipale.html");
  console.log("🔐 Admin     → http://localhost:3000/FenetreAdmine.html");
});