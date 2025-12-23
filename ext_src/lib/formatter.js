
/**
 * Extracts grading metrics from the raw HTML response.
 * @param {string} raw_html 
 * @returns {object|null}
 */
function extract_metrics(raw_html) {
    if (!raw_html) return null;

    const dom_nodes = new DOMParser().parseFromString(raw_html, 'text/html');
    const root_table = dom_nodes.getElementById('grades');

    if (!root_table) return null;

    // Helper to safely get text
    const get_txt = (el) => el ? el.textContent.trim() : '';

    // Extract metadata using regex on specific cells
    const rows = root_table.getElementsByTagName('tr');
    const meta_row = get_txt(rows[0].cells[0]);

    // Parsed metadata
    const meta = {
        y: (meta_row.match(/Year\s+(\d{4})/) || [])[1] || 'Unknown',
        s: (meta_row.match(/Semester\s+(\d)/) || [])[1] || 'Unknown',
        c: get_txt(rows[3].cells[1]) || 'Unknown'
    };

    const grade_set = new Set();
    const sub_sections = [];

    // Find all nested tables which contain actual grade data
    // Using simple loop instead of forEach for variety
    const nested_tables = root_table.getElementsByTagName('table');

    for (let i = 0; i < nested_tables.length; i++) {
        const tbl = nested_tables[i];
        if (tbl.parentElement.getAttribute('valign') !== 'top') continue;

        const hdr = get_txt(tbl.rows[0]);
        let sec_id = "All";

        const sec_match = hdr.match(/section\s+(\S+)/i);
        if (sec_match) {
            sec_id = sec_match[1];
        }

        const dist = {};
        let sum = 0;

        // Iterate rows of the inner table
        for (let j = 1; j < tbl.rows.length; j++) {
            const r = tbl.rows[j];
            if (r.cells.length < 2) continue;

            const k = get_txt(r.cells[0]);
            const v = parseInt(get_txt(r.cells[1]), 10);

            if (k === 'Total') {
                sum = v;
            } else if (k && !isNaN(v) && k !== 'II' && k.length < 4) {
                dist[k] = v;
                grade_set.add(k);
            }
        }

        sub_sections.push({
            id: sec_id,
            data: dist,
            sum: sum
        });
    }

    return {
        meta: meta,
        grades: Array.from(grade_set),
        segments: sub_sections
    };
}
