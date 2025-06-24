const scrapingVendor = require('../models/scrapingvendor');

const ScrapingVendorController = {
    async create(req, res) {
        try {
            const { name, scraping_method, username, password, api_url, countries_available, proxy, status, multiple_calls_supported, options } = req.body;
            const scraping_vendor = await scrapingVendor.create({
                name,
                scraping_method,
                username,
                password,
                api_url,
                countries_available,
                proxy,
                status,
                multiple_calls_supported,
                options
            });
            res.status(201).json({ data: scraping_vendor });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create scraping vendor' });
        }
    },

    async getAll(req, res) {
        try {
            const scrapingVendors = await db.ScrapingVendor.findAll();
            res.json(scrapingVendors);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to retrieve scraping vendors' });
        }
    },

    async getById(req, res) {
        try {
            const { id } = req.params;
            const scrapingVendor = await db.ScrapingVendor.findByPk(id);
            if (scrapingVendor) {
                res.json(scrapingVendor);
            } else {
                res.status(404).json({ error: 'Scraping vendor not found' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to retrieve scraping vendor' });
        }
    },

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, scraping_method, username, password, api_url, countries_available, proxy, status, multiple_calls_supported, options } = req.body;
            const [updated] = await scrapingVendor.update({
                name,
                scraping_method,
                username,
                password,
                api_url,
                countries_available,
                proxy,
                status,
                multiple_calls_supported,
                options
            }, {
                where: { id }
            });
            if (updated) {
                res.json({ message: 'Scraping vendor updated successfully' });
            } else {
                res.status(404).json({ error: 'Scraping vendor not found' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update scraping vendor' });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await db.ScrapingVendor.destroy({
                where: { id }
            });
            if (deleted) {
                res.json({ message: 'Scraping vendor deleted successfully' });
            } else {
                res.status(404).json({ error: 'Scraping vendor not found' });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to delete scraping vendor' });
        }
    }
};

module.exports = ScrapingVendorController;
