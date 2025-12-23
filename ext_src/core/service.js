
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "svc_retrieve") {

        chrome.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (!tabs || tabs.length === 0) {
                    throw new Error("No active tab");
                }
                return exec_extraction(tabs[0].id, req.courses);
            })
            .then(d => sendResponse({ result: d }))
            .catch(e => sendResponse({ error: e.message || "Unknown error" }));

        // Keep channel open
        return true;
    }
});

function exec_extraction(t_id, codes) {
    return chrome.scripting.executeScript({
        target: { tabId: t_id },
        func: payload_script,
        args: [codes]
    }).then(res => {
        const val = res[0].result;
        // Check for error object returned by script
        if (val && val.error) {
            throw new Error(val.error);
        }
        return val;
    });
}

/**
 * Injected script
 */
async function payload_script(targets) {
    const sleep = m => new Promise(r => setTimeout(r, m));

    // Different polling strategy: recursive check with limit
    const poll_el = async (root, sel, attempts = 50) => {
        if (root.document.querySelector(sel)) return true;
        if (attempts <= 0) throw new Error(`Timeout: ${sel}`);
        await sleep(200);
        return poll_el(root, sel, attempts - 1);
    };

    try {
        const f_menu = window.frames['leftPage'];
        const f_main = window.frames['rightPage'];

        if (!f_menu || !f_main) return { error: "Frames missing" };

        const lnk = f_menu.document.querySelector('a[href*="gradstatistics.jsp"]');
        if (!lnk) return { error: "Link missing" };

        const out_data = [];
        const start_y = new Date().getFullYear();
        const end_y = 2021;

        const process_sem = async (cc, y, s) => {
            lnk.click();
            await poll_el(f_main, 'input[name="txtcrsecode"]');

            // CRITICAL: 2-second delay required for server
            await sleep(2000);

            const doc = f_main.document;
            doc.querySelector('select[name="year"]').value = y;
            doc.querySelector('select[name="semester"]').value = s;
            doc.querySelector('input[name="txtcrsecode"]').value = cc;

            const btn = doc.querySelector('input[name="submit"]');
            // Fix: 'submit' input shadows the function, so we must call prototype directly
            HTMLFormElement.prototype.submit.call(btn.closest('form'));

            try {
                await poll_el(f_main, '#grades');

                // Re-fetch document to ensure it's fresh
                const fresh_doc = f_main.document;
                const t = fresh_doc.getElementById('grades');

                // Check 'NOT offered'
                const red = fresh_doc.querySelector('font[color="red"]');
                if (red && red.innerText.includes("NOT offered")) return null;

                if (t && t.querySelectorAll('td[valign="top"]').length > 0) {
                    return t.outerHTML;
                }
                return null;
            } catch {
                return null;
            }
        };

        for (const c of targets) {
            let hit = null;
            let h_y = 0;
            let h_s = 0;

            // Loop logic changed: check both sems for a year before moving back
            year_loop: for (let y = start_y; y >= end_y; y--) {
                for (let s of [2, 1]) {
                    const h = await process_sem(c, y, s);
                    if (h) {
                        hit = h; h_y = y; h_s = s;
                        break year_loop;
                    }
                }
            }

            out_data.push(hit
                ? { code: c, year: h_y, sem: h_s, raw: hit, stat: "OK" }
                : { code: c, stat: "FAIL" }
            );
        }

        return out_data;

    } catch (ex) {
        return { error: ex.toString() };
    }
}
