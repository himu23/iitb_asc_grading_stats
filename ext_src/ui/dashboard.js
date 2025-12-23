
document.addEventListener('DOMContentLoaded', () => {
    // Cache selectors
    const $ = (id) => document.getElementById(id);
    const ui = {
        in: $('q_area'),
        btn: $('go_btn'),
        stat: $('status_bar'),
        acts: $('post_actions'),
        tbl: $('data_grid'),
        copy: $('do_copy'),
        clr: $('do_clear')
    };

    const GRADES = ['AA', 'AB', 'BB', 'BC', 'CC', 'CD', 'DD', 'F', 'AP', 'FR'];

    // Utility for status updates
    const notify = (msg, level = 'neut') => {
        ui.stat.innerText = msg;
        ui.stat.style.display = msg ? 'block' : 'none';

        const colors = { err: '#f8d7da', good: '#d4edda', neut: '#e2e3e5' };
        const txt = { err: '#721c24', good: '#155724', neut: '#383d41' };

        ui.stat.style.backgroundColor = colors[level] || colors.neut;
        ui.stat.style.color = txt[level] || txt.neut;
    };

    // Main event handler using delegation where possible/sensible
    document.body.addEventListener('click', (e) => {
        const t = e.target;

        if (t === ui.btn) handle_fetch();
        if (t === ui.copy) handle_copy();
        if (t === ui.clr) {
            ui.tbl.tBodies[0].innerHTML = '';
            ui.tbl.tHead.innerHTML = '';
            ui.acts.style.display = 'none';
            ui.in.value = '';
            notify('');
        }
    });

    const handle_fetch = () => {
        const raw = ui.in.value;
        const targets = [];

        // Parsing using regex iterator for variety
        const rx = /\{([a-zA-Z0-9\s]+)\}/g;
        let m;
        while ((m = rx.exec(raw)) !== null) {
            targets.push(m[1].trim());
        }

        // Fallback split if no braces
        if (!targets.length) {
            raw.split(/\s+/).forEach(x => { if (x.length > 2) targets.push(x) });
        }

        const unique = [...new Set(targets.map(x => x.toUpperCase()))];

        if (!unique.length) return notify("Input invalid.", 'err');

        ui.btn.disabled = true;
        ui.btn.innerText = "Working...";
        notify("Contacting ASC...", 'neut');
        ui.acts.style.display = 'none';
        ui.tbl.tBodies[0].innerHTML = '';

        chrome.runtime.sendMessage({ action: "svc_retrieve", courses: unique }, (res) => {
            ui.btn.disabled = false;
            ui.btn.innerText = "Execute Fetch";

            if (chrome.runtime.lastError) {
                return notify(chrome.runtime.lastError.message, 'err');
            }

            if (res.error) return notify(res.error, 'err');
            if (res.result) {
                build_view(res.result);
                notify("Complete.", 'good');
            }
        });
    };

    const build_view = (data) => {
        const rows = [];
        const seen_g = new Set(GRADES);

        // Process data first to find all grade columns needed
        const proc_data = data.map(d => {
            if (d.stat !== 'OK' || !d.raw) return { code: d.code, meta: null };

            const m = extract_metrics(d.raw);
            if (m && m.grades) m.grades.forEach(g => seen_g.add(g));
            return { code: d.code, meta: m };
        });

        const sorted_g = Array.from(seen_g).sort();

        // Build Header
        let th = `<tr><th>#</th><th>C</th><th>Y</th><th>S</th><th>Sec</th><th>N</th>`;
        sorted_g.forEach(g => th += `<th>${g}</th>`);
        th += `</tr>`;
        ui.tbl.tHead.innerHTML = th;

        // Build Rows
        let idx = 1;
        proc_data.forEach(item => {
            if (!item.meta || !item.meta.segments.length) {
                let cell = `<tr>
                    <td>${idx++}</td><td>${item.code}</td>
                    <td colspan="4" style="text-align:center;color:#999">-</td>`;
                sorted_g.forEach(() => cell += `<td>0</td>`);
                cell += `</tr>`;
                rows.push(cell);
            } else {
                item.meta.segments.forEach(seg => {
                    let r = `<tr>
                        <td>${idx}</td>
                        <td>${item.code}</td>
                        <td>${item.meta.meta.y}</td>
                        <td>${item.meta.meta.s}</td>
                        <td>${seg.id}</td>
                        <td>${seg.sum}</td>`;

                    sorted_g.forEach(g => {
                        r += `<td>${seg.data[g] || 0}</td>`;
                    });
                    r += `</tr>`;
                    rows.push(r);
                });
                idx++;
            }
        });

        ui.tbl.tBodies[0].innerHTML = rows.join('');
        ui.acts.style.display = 'block';
    };

    const handle_copy = () => {
        const rng = document.createRange();
        rng.selectNode(ui.tbl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(rng);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
        notify("Copied.", 'good');
    };
});
