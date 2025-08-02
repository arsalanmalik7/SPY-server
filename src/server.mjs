import app from './app.mjs';
import connectDB from './db/index.mjs'

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
});
