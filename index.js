/* Modules */
const site = "sc-domain:xcriptech.com";
// import { firefox } from "playwright"; // Choose browser - Currently firefox but you can choose 'chromium' or 'webkit'.
const playwright = require("playwright-aws-lambda");
const reports = require("./report-types.js"); // Custom array of objects with specific params to access GSC reports

/* Settings */
const resource = encodeURIComponent(site); // Encode it to create the correct URL
const access = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&item_key=`; // URL to access each report
const reportSelector = ".OOHai"; // CSS Selector from report Urls

/* Data */
const results = []; // Empty holding array to push report results

function parser(str) {
  try {
    let parsedStr = JSON.parse(str);
    return parsedStr;
  } catch (e) {
    return str;
  }
}

exports.handler = async (event, context) => {
  let body = parser(event);
  // console.log("bodyyyyyy:", body);
  let { email, pass } = body;

  console.log("Launching browser..."); // Initial log to let the user know the script is running

  let browser = null;

  try {
    browser = await playwright.launchChromium({ headless: false });
    const context = await browser.newContext();

    const page = await context.newPage();
    await page.goto("https://search.google.com/search-console/welcome?hl=en");

    // Find and submit Email input
    console.log("Inputing email...");
    await page.type("css=input", email);
    // await page.keyboard.press("Enter");
    await page.click("text=Next");

    var title = await page.title();
    console.log("Page title: ", title);

    // Find and submit Password input
    console.log("Inputing password...");
    await page.waitForSelector("[name=password]", { delay: 50 });
    console.log("found Selector");

    await page.type("[name=password]", pass, { delay: 50 });

    await page.click("text=Next");

    // Detect if there is 2-factor authentication
    try {
      await page.waitForSelector("text=2-step", {
        timeout: 3000
      });
      console.log(
        "You have 2-step Verification enabled. Check your device to pass to the next step. The script will only wait for 30 seconds"
      );
      // Timeout of 10 seconds so the user can read the log message + 30secs automatic for the next selector
      await page.waitForTimeout(10000);
    } catch (e) {
      console.log(
        "No 2-step Verification was detected. Accessing Search Console..."
      );
    }

    // Try/Catch block in case the 2-factor auth fails or times out
    try {
      // Wait until navigating to GSC property
      await page.waitForSelector('text="Welcome to Google Search Console"');
      console.log("GSC access sucessful!");

      // Loop through report categories
      for (const { category, name, param } of reports) {
        // Access individual report
        await page.goto(`${access}${param}`);

        // Extract URLs from each report
        const reportUrls = await page.evaluate(
          ([sel, cat, rep]) => {
            // Extract Last Updated date
            const updated =
              document.querySelector(".zTJZxd.zOPr2c").innerText ?? "No date";

            // Extract URls and build result object
            const arr = Array.from(document.querySelectorAll(sel)).map(url => ({
              status: cat,
              "report name": rep,
              url: url.innerText.replace(//g, ""),
              updated: updated.replace(/[^\d|\/]+/g, "")
            }));
            return Promise.resolve(arr);
          },
          [reportSelector, category, name]
        );

        // Push urls from each report into results array for future CSV rows
        results.push(...reportUrls);

        // Log extraction result
        console.log(
          `Extracting ${name} report - ${reportUrls.length} URLs found`
        );
      }

      // Close Browser
      await browser.close();

      // Parse JSON to CSV if there is data to parse
      if (results.length) {
        console.log(results);
        var response = {
          statusCode: 200,
          body: JSON.stringify(results)
        };
        //writeFile('./coverage.csv', parse(results)) // Parse results JSON to CSV
      }
      console.log("All CSV outputs created!");
    } catch (error) {
      console.log(`There was an error running the script: ${error}`);
      var response = {
        statusCode: 500,
        body: JSON.stringify(`There was an error running the script: ${error}`)
      };
      process.exit();
    }
  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    return response;
  }
};
