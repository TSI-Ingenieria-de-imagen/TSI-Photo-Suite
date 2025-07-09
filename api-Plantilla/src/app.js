const express = require('express');
const cors = require('cors');
const path = require('path');
const plantillaRouter = require('./routers/plantilla.routers');
const errorHandling = require('./error/errorHandling');

const app = express();
app.use(cors());
app.use(express.json());

// Configurar express.static para que la carpeta lo sirva en internet y se pueda acceder

app.use('/imagenesPlantillaR13', express.static('C:\\imagenesPlantillaR13'));


app.use(plantillaRouter);
app.use(errorHandling.errorHandling);

module.exports = app;
