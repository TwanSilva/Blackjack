import './styles.css';
import { app } from './app';
import { hubScreen } from './screens/hub';
import { statsScreen } from './screens/stats';

app.home = hubScreen;
app.tabs = { drill: hubScreen, stats: statsScreen };
app.goHome();
