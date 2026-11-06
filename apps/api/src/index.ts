import { app } from './app.ts';
import {config} from './config.ts'

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`API running on http://localhost:${config.PORT}`);
});
