// FrontEnd/api.js
(function() {

  // ── Attendre que la page soit prête
  window.addEventListener('load', async function() {
    await reloadProductsFromDB();
    if(typeof renderProducts === 'function') renderProducts();
    if(typeof updateBadges  === 'function') updateBadges();
    console.log('✅ Produits DB chargés :', products.length);
  });

  // ── Recharger les produits depuis la DB
  window.reloadProductsFromDB = async function() {
    try {
      const res  = await fetch('/api/admin/products');
      const data = await res.json();
      if(data.success && Array.isArray(data.products)) {
        products = data.products.map(p => ({
          id:          p.id,
          name:        p.name,
          cat:         p.cat,
          price:       p.price,
          oldPrice:    p.oldPrice  || null,
          rating:      p.rating    || 0,
          ratingCount: p.ratingCount || 0,
          badge:       p.badge     || null,
          stock:       p.stock,
          img:         p.img       || '',
          specs:       p.specs     || '',
          desc:        p.desc      || '',
          specItems:   p.specItems || {},
          reviews:     p.reviews   || [],
          imgs:        p.imgs      || []
        }));
        console.log('✅ Produits rechargés depuis DB :', products.length);
      }
    } catch(err) {
      console.warn('⚠️ Reload products error:', err);
    }
  };

  // ── Ajouter / Modifier produit
  window.saveProd = async function() {
    const idx    = parseInt(document.getElementById('prodIdx').value);
    const isEdit = idx >= 0 && products[idx] && products[idx].id;

    const item = {
      nom:         (document.getElementById('pName').value  || '').trim(),
      categorie:   document.getElementById('pCat').value,
      prix:        parseFloat(document.getElementById('pPrice').value) || 0,
      stock:       parseInt(document.getElementById('pStock')?.value) || 10,
      image:       (document.getElementById('pImg').value   || '').trim(),
      description: (document.getElementById('pSpecs').value || '').trim(),
      marque:      (document.getElementById('pMarque')?.value || '').trim()
    };

    if(!item.nom){
      toast('⚠️ Le nom est obligatoire'); return;
    }
    if(!item.prix){
      toast('⚠️ Le prix est obligatoire'); return;
    }

    try {
      let res;

      if(isEdit){
        // Modifier
        res = await fetch('/api/products/' + products[idx].id, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(item)
        });
      } else {
        // Ajouter
        res = await fetch('/api/products', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(item)
        });
      }

      const data = await res.json();

      if(!data.success){
        toast('⚠️ ' + (data.message || 'Erreur serveur'));
        return;
      }

      // Recharger depuis DB et rafraîchir l'affichage
      closeModal('prodModal');
      await renderProducts();
       updateBadges();
       toast(isEdit ? '✓ Produit modifié !' : '✓ Produit ajouté !');

    } catch(err) {
      console.error('saveProd error:', err);
      toast('⚠️ Erreur réseau : ' + err.message);
    }
  };

  // ── Supprimer produit
  window.delProd = async function(i) {
    if(!confirm('Supprimer ce produit ?')) return;
    const p = products[i];
    if(!p) return;

    try {
      if(p.id){
        const res  = await fetch('/api/products/' + p.id, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if(!data.success){
          toast('⚠️ ' + (data.message || 'Erreur suppression'));
          return;
        }
      }

      // Recharger depuis DB et rafraîchir
      await renderProducts();
      updateBadges();
      toast('✓ Produit supprimé');

    } catch(err) {
      console.error('delProd error:', err);
      toast('⚠️ Erreur : ' + err.message);
    }
  };

})();