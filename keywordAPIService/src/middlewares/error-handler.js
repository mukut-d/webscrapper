const errorHandler = (err, req, res, next) => {
    // Log error details
    console.error('Error:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    });

    // Don't call next() after sending response
    if (res.headersSent) {
        return next(err);
    }

    // Handle different types of errors
    switch (err.name) {
        case 'AssertionError':
            return res.status(400).json({
                status: 'error',
                message: err.message
            });

        case 'SequelizeValidationError':
            return res.status(400).json({
                status: 'error',
                message: err.errors.map(e => e.message)
            });

        case 'SequelizeUniqueConstraintError':
            return res.status(409).json({
                status: 'error',
                message: 'Record already exists'
            });

        default:
            return res.status(err.statusCode || 500).json({
                status: 'error',
                message: err.message || 'Internal Server Error'
            });
    }
};

module.exports = errorHandler;