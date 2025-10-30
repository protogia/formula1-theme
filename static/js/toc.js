document.addEventListener('DOMContentLoaded', () => {
    const tocLinks = document.querySelectorAll('.toc-area a');
    const sections = document.querySelectorAll('.content-area h2, .content-area h3, .content-area h4');
    
    // Create a map of content IDs to TOC links for quick lookup
    const idToLinkMap = {};
    tocLinks.forEach(link => {
        // Extract the target ID (e.g., #section-title -> section-title)
        const targetId = link.getAttribute('href').substring(1);
        idToLinkMap[targetId] = link;
    });

    const observer = new IntersectionObserver((entries) => {
        let currentActiveId = null;
        
        // 1. Determine the highest section currently intersecting (visible)
        entries.forEach(entry => {
            if (entry.intersectionRatio > 0) { // If it's visible at all
                // This logic ensures the *first* visible section (from the top) is prioritized
                if (!currentActiveId || entry.target.offsetTop < document.getElementById(currentActiveId).offsetTop) {
                    currentActiveId = entry.target.id;
                }
            }
        });

        // 2. Clear all active classes
        tocLinks.forEach(link => {
            link.classList.remove('active');
        });

        // 3. Set the active class on the determined link
        if (currentActiveId && idToLinkMap[currentActiveId]) {
            idToLinkMap[currentActiveId].classList.add('active');
        }
    }, {
        rootMargin: '0px 0px -75% 0px', // Adjusts the "active" zone 
        threshold: 1 // Triggers when 10% of the element is visible
    });

    // Observe every content section
    sections.forEach(section => {
        // Hugo automatically adds 'id' attributes to headings, but confirm they exist
        if (section.id) {
            observer.observe(section);
        }
    });
});
