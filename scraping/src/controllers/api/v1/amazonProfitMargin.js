// const puppeteer = require("puppeteer");

// (async () => {
//   // Launch the browser and open a new blank page
//   const browser = await puppeteer.launch({ headless: false });
//   const page = await browser.newPage();

//   // Navigate the page to a URL
//   await page.goto(
//     "https://sellercentral.amazon.com/hz/fba/profitabilitycalculator/index?lang=en_US&ld=NSGoogle"
//   );

//   // Set screen size
//   await page.setViewport({ width: 1080, height: 1024 });

//   // Click the first button
//   await page.evaluate(() => {
//     const button = document
//       .querySelector("#root > kat-modal > div > kat-button.spacing-top-small")
//       .shadowRoot.querySelector("button");
//     button.click();
//   });

//   // Add a delay to allow the page to react to the first click
//   await page.waitForTimeout(2000);

//   // Click the second button
//   await page.evaluate(() => {
//     const button = document.querySelector(
//       "#ProductSearchInput > kat-dropdown > kat-option:nth-child(1)"
//     );
//     button.click();
//   });

//   // Add a delay to allow the page to react to the second click
//   await page.waitForTimeout(2000);

//   // Set the value of the search box - here we have to enter the ASIN number
//   await page.evaluate(() => {
//     const input = document
//       .querySelector("#ProductSearchInput > kat-input")
//       .shadowRoot.querySelector("#katal-id-4");
//     input.value = "B0928LBM8C";
//   });

//   // Add a delay to allow the page to react to setting the value
//   await page.waitForTimeout(2000);

//   // Click the third button
//   await page.evaluate(() => {
//     const button = document
//       .querySelector("#ProductSearchInput > kat-button")
//       .shadowRoot.querySelector("button");
//     button.click();
//   });

//   // Add a delay to allow the page to react to the third click
//   await page.waitForTimeout(2000);

//   // Wait for the selector to appear in the page
//   await page.waitForSelector(
//     "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div:nth-child(1) > kat-label"
//   );

//   // Extract the Amazon Fees
//   const amazonFees = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div:nth-child(1) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("amazonFees: ", amazonFees);

//   // Wait for the selector to appear in the page
//   await page.waitForSelector(
//     "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(1) > kat-label"
//   );

//   // Extract the Referral Fees
//   const referralFees = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(1) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("referralFees: ", referralFees);

//   // Wait for the selector to appear in the page
//   await page.waitForSelector(
//     "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(2) > kat-label"
//   );

//   // Extract the Fixed Closing Fees
//   const fixedClosingFees = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(2) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("fixedClosingFees: ", fixedClosingFees);

//   // Wait for the selector to appear in the page
//   await page.waitForSelector(
//     "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(3) > kat-label"
//   );

//   // Extract the Variable Closing Fees
//   const variableClosingFees = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(3) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("variableClosingFees: ", variableClosingFees);

//   // Extract the initial values
//   const costPerUnit1 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(1) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   const netProfit1 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(3) > kat-label.net-profit-currency-positive"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   const netMargin1 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(4) > kat-label.net-profit-currency-positive"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("costPerUnit1: ", costPerUnit1);
//   console.log("netProfit1: ", netProfit1);
//   console.log("netMargin1: ", netMargin1);

//   // Click the button
//   await page.evaluate(() => {
//     const button = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(3) > div.section-expander-content > div.input-block-justify-end.input-block-padding > div > kat-button-group > kat-button:nth-child(2)"
//       )
//       .shadowRoot.querySelector("button");
//     button.click();
//   });

//   // Add a delay to allow the page to react to the click
//   await page.waitForTimeout(2000);

//   // Extract the values after clicking the button
//   const costPerUnit2 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(1) > kat-label"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   const netProfit2 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(3) > kat-label.net-profit-currency-positive"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   const netMargin2 = await page.evaluate(() => {
//     const element = document
//       .querySelector(
//         "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(4) > kat-label.net-profit-currency-positive"
//       )
//       .shadowRoot.querySelector("label > slot > span");
//     return element.innerText;
//   });

//   console.log("costPerUnit2: ", costPerUnit2);
//   console.log("netProfit2: ", netProfit2);
//   console.log("netMargin2: ", netMargin2);

//   // await browser.close();
// })();

// ---------------------------------------

const puppeteer = require("puppeteer");

async function scrapeProduct(product) {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto(
    "https://sellercentral.amazon.com/hz/fba/profitabilitycalculator/index?lang=en_US&ld=NSGoogle"
  );

  // Set screen size
  await page.setViewport({ width: 1080, height: 1024 });

  // Click the first button
  await page.evaluate(() => {
    const button = document
      .querySelector("#root > kat-modal > div > kat-button.spacing-top-small")
      .shadowRoot.querySelector("button");
    button.click();
  });

  // Add a delay to allow the page to react to the first click
  await page.waitForTimeout(2000);

  // Click the second button
  await page.evaluate(() => {
    const button = document.querySelector(
      "#ProductSearchInput > kat-dropdown > kat-option:nth-child(1)"
    );
    button.click();
  });

  // Add a delay to allow the page to react to the second click
  await page.waitForTimeout(2000);

  // Set the value of the search box - here we have to enter the ASIN number
  await page.evaluate((asin) => {
    const input = document
      .querySelector("#ProductSearchInput > kat-input")
      .shadowRoot.querySelector("#katal-id-4");
    input.value = asin;
  }, product.asin); // pass the product's ASIN number to the page.evaluate function

  // Add a delay to allow the page to react to setting the value
  await page.waitForTimeout(2000);

  // Click the third button
  await page.evaluate(() => {
    const button = document
      .querySelector("#ProductSearchInput > kat-button")
      .shadowRoot.querySelector("button");
    button.click();
  });

  // Add a delay to allow the page to react to the third click
  await page.waitForTimeout(2000);

  // Wait for the selector to appear in the page
  await page.waitForSelector(
    "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div:nth-child(1) > kat-label"
  );

  // Extract the Amazon Fees
  const amazonFees = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div:nth-child(1) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("amazonFees: ", amazonFees);

  // Wait for the selector to appear in the page
  await page.waitForSelector(
    "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(1) > kat-label"
  );

  // Extract the Referral Fees
  const referralFees = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(1) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("referralFees: ", referralFees);

  // Wait for the selector to appear in the page
  await page.waitForSelector(
    "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(2) > kat-label"
  );

  // Extract the Fixed Closing Fees
  const fixedClosingFees = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(2) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("fixedClosingFees: ", fixedClosingFees);

  // Wait for the selector to appear in the page
  await page.waitForSelector(
    "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(3) > kat-label"
  );

  // Extract the Variable Closing Fees
  const variableClosingFees = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(1) > div.section-expander-content > div:nth-child(3) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("variableClosingFees: ", variableClosingFees);

  // Extract the initial values
  const costPerUnit1 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(1) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  const netProfit1 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(3) > kat-label.net-profit-currency-positive"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  const netMargin1 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(4) > kat-label.net-profit-currency-positive"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("costPerUnit1: ", costPerUnit1);
  console.log("netProfit1: ", netProfit1);
  console.log("netMargin1: ", netMargin1);

  // Click the button
  await page.evaluate(() => {
    const button = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-top > div.cost-section > div > kat-expander:nth-child(3) > div.section-expander-content > div.input-block-justify-end.input-block-padding > div > kat-button-group > kat-button:nth-child(2)"
      )
      .shadowRoot.querySelector("button");
    button.click();
  });

  // Add a delay to allow the page to react to the click
  await page.waitForTimeout(2000);

  // Extract the values after clicking the button
  const costPerUnit2 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(1) > kat-label"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  const netProfit2 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(3) > kat-label.net-profit-currency-positive"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  const netMargin2 = await page.evaluate(() => {
    const element = document
      .querySelector(
        "#ProgramCard > div.program-card-box-under > div.program-card-box-bottom > div > div.profit-section-content > div:nth-child(4) > kat-label.net-profit-currency-positive"
      )
      .shadowRoot.querySelector("label > slot > span");
    return element.innerText;
  });

  console.log("costPerUnit2: ", costPerUnit2);
  console.log("netProfit2: ", netProfit2);
  console.log("netMargin2: ", netMargin2);

  // Extract the data and store it in an object
  const data = {
    amazonFees,
    referralFees,
    fixedClosingFees,
    variableClosingFees,
    costPerUnit1,
    netProfit1,
    netMargin1,
    costPerUnit2,
    netProfit2,
    netMargin2,
  };

  // Close the browser
  await browser.close();

  // Return the scraped data
  return data;
}

async function amazonProfitMargin(products) {
  // Run the scrapeProduct function for each product in parallel
  const promises = products.map(scrapeProduct);
  const scrapedData = await Promise.all(promises);

  // scrapedData is now an array of objects, where each object contains the scraped data for a product

  // TODO: Perform the DB write operation one by one

  // Return a promise that resolves when all the scraping is done
  return Promise.resolve(scrapedData);
}

module.exports = amazonProfitMargin;
