document.addEventListener('DOMContentLoaded', () => {
    const darkModeToggle = document.getElementById('darkModeToggle');

    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');

        if(document.body.classList.contains('dark-mode')){
            localStorage.setItem('darkMode', 'enabled');
        } else {
            localStorage.setItem('darkMode', 'disabled');
        }
    });

    if(localStorage.getItem('darkMode') === 'enabled'){
        document.body.classList.add('dark-mode');
    }
});
// sombre.js
document.addEventListener('DOMContentLoaded', () => {
    // Vérifie si le mode sombre a été activé précédemment
    if(localStorage.getItem('darkMode') === 'enabled'){
        document.body.classList.add('dark-mode');
    }
});