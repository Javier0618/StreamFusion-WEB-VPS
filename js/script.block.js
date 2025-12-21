document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', function(e) {
    if (
        e.key === 'F12' || // DevTools
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) || // Ctrl+Shift+I/J/C/K
        (e.ctrlKey && ['U', 'S', 'P'].includes(e.key.toUpperCase())) || // Ctrl+U/S/P
        (e.metaKey && e.altKey && e.key.toUpperCase() === 'I') // Cmd+Alt+I en Mac
    ) {
        e.preventDefault();
        return false;
    }
});

document.querySelectorAll('iframe').forEach(frame => {
    frame.addEventListener('contextmenu', e => e.preventDefault());
});
