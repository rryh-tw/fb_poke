const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const config = require('./config.js');

const FACEBOOK_URL = 'https://www.facebook.com/';
const COOKIES_FILE_PATH = './cookies.json';

async function loadCookies(page) {
    try {
        const cookiesString = await fs.readFile(COOKIES_FILE_PATH, 'utf-8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log('Session cookies have been loaded from file.');
    } catch (err) {
        console.log('No saved cookies could be loaded. Logging in...');
    }
}

async function login(page) {
    await page.goto(FACEBOOK_URL, {
        waitUntil: 'networkidle2'
    });

    if (await page.$('#email') !== null) {
        await page.type('#email', config.facebook.email);
        await page.type('#pass', config.facebook.password);
        await page.click('[type="submit"]');
        await page.waitForNavigation({
            waitUntil: 'networkidle2'
        });
    }
}

async function waitForCheckpoint(page) {
    let checkpointFound = true;
    while (checkpointFound) {
        const cookies = await page.cookies();
        if (cookies.some(cookie => cookie.name === 'checkpoint')) {
            console.log('Checkpoint cookie found, waiting...');
            // Wait for 30 seconds before checking the cookies again
            await new Promise(resolve => setTimeout(resolve, 30000));
        } else {
            checkpointFound = false;
            await fs.writeFile(COOKIES_FILE_PATH, JSON.stringify(cookies, null, 2));
            console.log('Session cookies have been saved to file.');
        }
    }
}

async function findAncestorDiv(page, keyword) {
    const ancestorDivHandle = await page.evaluateHandle((keyword) => {
        const divsWithTargetATag = document.querySelectorAll('div');

        for (const div of divsWithTargetATag) {
            const targetATag = div.querySelector('a');
            if (targetATag && targetATag.textContent.trim() === keyword) {
                let currentNode = targetATag.parentNode;
                for (let i = 0; i < 10; i++) {
                    currentNode = currentNode.parentNode;
                }
                return currentNode;
            }
        }

        return null;
    }, keyword);

    return ancestorDivHandle;
}

async function clickDivInsideAncestorDiv(page, ancestorDivHandle) {
    if (ancestorDivHandle) {
        await page.evaluate((ancestorDiv) => {
            const divToClick = ancestorDiv.querySelector('div[aria-label="戳回去"]');
            if (divToClick) {
                divToClick.click();
                // console.log("poky");
            } else {
                // console.log("waiting...");
            }
        }, ancestorDivHandle);
    }
}

async function keywordExists(page, keyword) {
    await page.waitForSelector('a'); // Wait for at least one link to appear on the page
    const exists = await page.evaluate((keyword) => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.some(link => link.textContent.trim() === keyword);
    }, keyword);

    return exists;
}

async function main() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: config.browser_path,
        slowMo: 20,
        args: ['--disable-notifications'],
    });
    const page = await browser.newPage();
    await page.setViewport({
        width: 1280,
        height: 800
    });

    await loadCookies(page);
    await login(page);
    await waitForCheckpoint(page);

    const keywords = config.keywords;
    let pokyInterval;

    let userState = {};
    async function refreshPokyPage() {
        try {
            await page.goto('https://www.facebook.com/pokes/');
            console.log('Poky page refreshed.');
            await poky(); // Execute poky after refreshing the page
        } catch (error) {
            console.error('Error occurred in refreshPokyPage:', error);
            // Handle the error as needed
        }

        // Schedule the next refresh after a delay
        setTimeout(refreshPokyPage, 60000);
    }


    async function poky() {
        try {
            for (const keyword of keywords) {
                const keywordExistsInPage = await keywordExists(page, keyword);
                if (keywordExistsInPage) {
                    const ancestorDivHandle = await findAncestorDiv(page, keyword);
                    if (ancestorDivHandle) {
                        if (userState[keyword] != true) {
                            userState[keyword] = true;
                            console.log(`Challenging ${keyword}...`);
                        }
                        await clickDivInsideAncestorDiv(page, ancestorDivHandle);
                    } else {
                        if (userState[keyword] != false) {
                            console.log(`Ancestor div not found for keyword '${keyword}'.`);
                            userState[keyword] = false;
                        }
                    }
                } else {
                    if (userState[keyword] != false) {
                        console.log(`${keyword} is sleeping.`);
                        userState[keyword] = false;
                    }
                }
            }
        } catch (error) {
            console.error('Error occurred in poky:', error);
            // Handle the error as needed
        }
        setTimeout(poky, 500);
    }
    refreshPokyPage();
}

main();