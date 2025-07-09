const { Router } = require("express");
const router = Router();
const plantillaCtrl = require("../controller/plantilla.controller");
const multer = require('multer');

router.post("/buscar-of/:numeroOF", plantillaCtrl.buscarOrden); // Buscar la orden y copia todos los archivos del destino en C:\imagenesPlantillaR13 para su lectura 
router.post("/buscar-orden-cv/:numeroOF", plantillaCtrl.buscarOrdenCv); // Buscar la orden y copia las fotos en C:\imagenesPlantillaR13 para su lectura y lanzamiento
router.post("/limpiar-carpeta-temporal", plantillaCtrl.limpiarCarpetaTemporal); // Limpia todo lo que pueda haber en en C:\imagenesPlantillaR13 para cargar fotos .
router.post('/copiarArchivo', plantillaCtrl.copiarArchivo); // Copia el txt de Repsol para poder construir las rutas
// router.post("/exportar-imagenes", plantillaCtrl.exportarImagenesADocumento); //Esto genera un doc.word con las imagenes ya ordenadas bajo su seccion  
router.post('/procesar-pdf',plantillaCtrl.procesarPDF); //GUARDA EL PDF EN TEMP LO COMPRIME Y LO GUARDA EN LAS PREFACTURAS DE LA ORDEN 

router.get("/leer-carpeta-temporal", plantillaCtrl.leerCarpetaTemporal);//Enpoint que sirve para visualizar todas la fotos actuales que hay en la carpeta temporal

router.post('/copiar-fotos', plantillaCtrl.copiarYComprimirFotosDesdeCarpeta); // Copiar y comprimir fotos desde una carpeta seleccionada


// PAGINA 2 : // ENDPOINT PARA LA PAGINA 2 , QUE ES UN POCO MAS MANUAL : 







module.exports = router;
