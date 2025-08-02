export const welcomeMessage = (req, res) => {
    res.status(200).json({
        message: "Welcome to My Node.js API!",
        status: "success",
        timestamp: new Date().toISOString(),
        documentation: "https://yourapi.com/docs", // Replace with your actual API docs link
    });
};
