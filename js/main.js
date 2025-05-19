document.addEventListener('DOMContentLoaded', function() {
    const copyrightYearSpan = document.getElementById('copyrightYear');
    if (copyrightYearSpan) {
        copyrightYearSpan.textContent = new Date().getFullYear();
    }
}); 