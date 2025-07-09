const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const util = require("util");
const officegen = require("officegen");
const sharp = require("sharp");
const ExifImage = require('exif').ExifImage;
const pdf2img = require("pdf-poppler");

const express = require("express");
const { error, log } = require("console");
const router = express.Router();
const { exec } = require("child_process");

const copiarFotos = util.promisify(fs.copyFile);
const unlink = util.promisify(fs.unlink);
const readdir = util.promisify(fs.readdir);

// Función para crear respuestas de error estandarizadas
const crearRespuestaError = (codigo, mensaje, detalles = null) => {
  return {
    success: false,
    error: {
      codigo,
      mensaje,
      detalles
    }
  };
};

// Función para crear respuestas de éxito estandarizadas
const crearRespuestaExito = (datos, mensaje = "Operación exitosa") => {
  return {
    success: true,
    mensaje,
    datos
  };
};

// Función para validar que existan los archivos necesarios
const validarArchivosNecesarios = async () => {
  const archivos = [
    "C:/TEMP/OFYTIPOS.txt",
    "C:/TEMP/MisEstaciones.txt"
  ];
  
  const archivosNoExisten = [];
  
  for (const archivo of archivos) {
    try {
      await fsPromises.access(archivo, fs.constants.F_OK);
    } catch (error) {
      archivosNoExisten.push(archivo);
    }
  }
  
  return archivosNoExisten;
};

const copiarYComprimirFoto = async (rutaOrigen, rutaDestino) => {
  try {
    // Verificar que el archivo origen existe
    await fsPromises.access(rutaOrigen, fs.constants.F_OK);
    
    const imagen = sharp(rutaOrigen);
    await imagen
      .withMetadata()
      .jpeg({ quality: 85 })
      .toFile(rutaDestino);
      
    console.log(`✓ Imagen copiada y comprimida: ${path.basename(rutaOrigen)}`);
  } catch (error) {
    console.error(`✗ Error al copiar y comprimir la imagen: ${rutaOrigen}`, error.message);
    throw new Error(`No se pudo procesar la imagen ${path.basename(rutaOrigen)}: ${error.message}`);
  }
};

const analizarMetadatosImagen = async (rutaImagen) => {
  try {
    // Verificar que el archivo existe
    await fsPromises.access(rutaImagen, fs.constants.F_OK);
    
    const metadata = await sharp(rutaImagen).withMetadata().metadata();
    const { width, height, orientation } = metadata;

    console.log(`📸 Procesando imagen: ${path.basename(rutaImagen)}, Ancho: ${width}, Alto: ${height}, Orientación: ${orientation}`);

    let esHorizontal = false;
    if (orientation === 1 || orientation === 3) {
      esHorizontal = width > height;
    } else if (orientation === 6 || orientation === 8) {
      esHorizontal = height > width;
    }

    let fechaCaptura = null;
    try {
      await new Promise((resolve, reject) => {
        new ExifImage({ image: rutaImagen }, (error, exifData) => {
          if (error) {
            console.warn(`⚠️ No se pudieron obtener datos EXIF de ${path.basename(rutaImagen)}`);
            resolve();
          } else {
            fechaCaptura = exifData.exif?.DateTimeOriginal || null;
            resolve();
          }
        });
      });
    } catch (exifError) {
      console.warn(`⚠️ Error al procesar EXIF de ${path.basename(rutaImagen)}: ${exifError.message}`);
    }

    return { 
      url: `/imagenesPlantillaR13/${path.basename(rutaImagen)}`, 
      esHorizontal, 
      fechaCaptura 
    };
  } catch (error) {
    console.error(`✗ Error al procesar la imagen ${rutaImagen}:`, error.message);
    throw new Error(`No se pudo analizar la imagen ${path.basename(rutaImagen)}: ${error.message}`);
  }
};

const buscarOrden = async (req, res) => {
  const orden = req.params.numeroOF;
  const destino = req.body.destino;
  const carpetaTemporal = "C:\\imagenesPlantillaR13";

  console.log(`🔍 Buscando orden: ${orden}, destino: ${destino}`);

  try {
    // Validaciones iniciales
    if (!orden) {
      return res.status(400).json(crearRespuestaError(
        "ORDEN_INVALIDA",
        "La orden ingresada no es válida"
      ));
    }

    if (orden.length !== 8) {
      return res.status(400).json(crearRespuestaError(
        "ORDEN_FORMATO_INVALIDO",
        "La orden debe tener exactamente 8 dígitos"
      ));
    }

    // Verificar archivos necesarios
    const archivosNoExisten = await validarArchivosNecesarios();
    if (archivosNoExisten.length > 0) {
      return res.status(500).json(crearRespuestaError(
        "ARCHIVOS_FALTANTES",
        "Faltan archivos necesarios para procesar la orden",
        { archivos: archivosNoExisten }
      ));
    }

    // Verificar que la carpeta temporal existe
    try {
      await fsPromises.access(carpetaTemporal, fs.constants.F_OK);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "CARPETA_TEMPORAL_NO_EXISTE",
        "La carpeta temporal no existe",
        { ruta: carpetaTemporal }
      ));
    }

    // Leer archivo de órdenes
    let data;
    try {
      data = await fsPromises.readFile("C:/TEMP/OFYTIPOS.txt", "utf8");
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_ORDENES",
        "No se pudo leer el archivo de órdenes",
        { error: error.message }
      ));
    }

    // Buscar la orden
    const lineas = data.split("\n");
    let lineaEncontrada = null;

    for (const linea of lineas) {
      const campos = linea.split(",");
      if (campos[0] === orden) {
        lineaEncontrada = campos;
        break;
      }
    }

    if (!lineaEncontrada) {
      return res.status(404).json(crearRespuestaError(
        "ORDEN_NO_ENCONTRADA",
        `La orden ${orden} no fue encontrada en el sistema`
      ));
    }

    console.log(`✓ Orden encontrada: ${orden}`);

    // Validar que la línea tenga todos los campos necesarios
    if (lineaEncontrada.length < 7) {
      return res.status(500).json(crearRespuestaError(
        "ORDEN_DATOS_INCOMPLETOS",
        "Los datos de la orden están incompletos",
        { campos: lineaEncontrada }
      ));
    }

    const tipoCliente = lineaEncontrada[6];
    
    // Leer archivo de estaciones
    let dataEstaciones;
    try {
      dataEstaciones = await fsPromises.readFile("C:/TEMP/MisEstaciones.txt", "utf8");
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_ESTACIONES",
        "No se pudo leer el archivo de estaciones",
        { error: error.message }
      ));
    }

    // Buscar estación
    const estaciones = dataEstaciones.split("\n");
    let estacionEncontrada = estaciones.find((est) =>
      est.startsWith(lineaEncontrada[3] + "|")
    );

    if (!estacionEncontrada) {
      return res.status(404).json(crearRespuestaError(
        "ESTACION_NO_ENCONTRADA",
        `La estación ${lineaEncontrada[3]} no fue encontrada`,
        { estacion: lineaEncontrada[3] }
      ));
    }

    console.log(`✓ Estación encontrada: ${lineaEncontrada[3]}`);

    // Procesar datos de la estación
    const datosEstacion = estacionEncontrada.split("|");
    if (datosEstacion.length < 6) {
      return res.status(500).json(crearRespuestaError(
        "ESTACION_DATOS_INCOMPLETOS",
        "Los datos de la estación están incompletos",
        { datos: datosEstacion }
      ));
    }

    const datosOrden = {
      orden: lineaEncontrada[0],
      aviso: lineaEncontrada[2],
      estacion: lineaEncontrada[3],
      tipo: lineaEncontrada[6],
      ciudad: lineaEncontrada[4],
      pueblo: lineaEncontrada[5],
      nombre: datosEstacion[5],
      poblacion: datosEstacion[2],
      direccion: datosEstacion[4],
      nombreEstacionEstaciones: datosEstacion[0],
      tipoUnidad: datosEstacion[1],
      provincia: datosEstacion[3],
    };

    // Determinar ruta base según tipo de cliente
    let rutaBase = "";
    const tiposCliente = {
      "REP": "\\\\Kyrios\\REPSOL\\ESP\\00-REDEES\\",
      "RPP": "\\\\Kyrios\\REPSOL\\POR\\00-REDEES\\",
      "REX": "\\\\Kyrios\\REPSOL\\MEX\\00-REDEES\\",
      "GAP": "\\\\Kyrios\\galp\\ES\\00-REDEES\\",
      "GPT": "\\\\Kyrios\\galp\\PT\\00-REDEES\\",
      "CGS": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CCL": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CEO": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CET": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CSA": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CED": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CVR": "\\\\Kyrios\\cepsa\\ES\\00-REDEES\\",
      "CSP": "\\\\Kyrios\\cepsa\\PT\\00-REDEES\\",
      "CEG": "\\\\Kyrios\\cepsa\\GI\\00-REDEES\\",
      "FCP": "\\\\Kyrios\\ClientesVarios\\CEPSA - FCP\\ES\\00-Obras\\",
      "SPS": "\\\\Kyrios\\ClientesVarios\\CESPA - SPS\\ES\\00-Obras\\",
      "DSA": "\\\\KYRIOS\\Shell\\ES\\00-REDEES\\",
      "DSL": "\\\\KYRIOS\\Shell\\PT\\00-REDEES\\",
    };

    rutaBase = tiposCliente[tipoCliente];
    
    if (!rutaBase) {
      return res.status(400).json(crearRespuestaError(
        "TIPO_CLIENTE_NO_RECONOCIDO",
        `El tipo de cliente '${tipoCliente}' no es reconocido`,
        { tipoCliente }
      ));
    }

    // Construir ruta completa
    let rutaCompleta = `${rutaBase}${lineaEncontrada[4]}\\${lineaEncontrada[3]} - ${lineaEncontrada[5]}\\${lineaEncontrada[0].slice(0, 4)}-${lineaEncontrada[0].slice(4)} - ${lineaEncontrada[1]}`;

    if (destino && destinos.hasOwnProperty(destino)) {
      rutaCompleta += `\\${destinos[destino]}`;
    }

    let rutaPref = rutaCompleta;
    console.log(`📁 Ruta construida: ${rutaCompleta}`);

    // Verificar si la ruta existe
    try {
      await fsPromises.access(rutaCompleta, fs.constants.F_OK);
    } catch (error) {
      console.log(`⚠️ Ruta no encontrada: ${rutaCompleta}`);
      
      // Intentar abrir carpeta anterior
      let rutaAnterior = `${rutaBase}${lineaEncontrada[4]}\\${lineaEncontrada[3]} - ${lineaEncontrada[5]}`;
      
      try {
        await fsPromises.access(rutaAnterior, fs.constants.F_OK);
        
        exec(`start "" "${rutaAnterior}"`, (error) => {
          if (error) {
            console.error("Error al abrir la carpeta anterior:", error);
          }
        });
        
        return res.status(404).json(crearRespuestaError(
          "CARPETA_ORDEN_NO_ENCONTRADA",
          `La carpeta de la orden ${orden} no existe`,
          { 
            rutaEsperada: rutaCompleta,
            rutaAnterior,
            mensaje: "Se ha abierto la carpeta anterior disponible"
          }
        ));
      } catch (error2) {
        return res.status(404).json(crearRespuestaError(
          "RUTA_COMPLETA_NO_ENCONTRADA",
          `No se encontró ninguna carpeta relacionada con la orden ${orden}`,
          { 
            rutaEsperada: rutaCompleta,
            rutaAnterior
          }
        ));
      }
    }

    // Leer contenido de la carpeta
    let archivos;
    try {
      archivos = await fsPromises.readdir(rutaCompleta);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_CARPETA",
        "No se pudo leer el contenido de la carpeta",
        { ruta: rutaCompleta, error: error.message }
      ));
    }

    // Filtrar carpetas
    const carpetas = [];
    for (const archivo of archivos) {
      try {
        const stats = await fsPromises.lstat(path.join(rutaCompleta, archivo));
        if (stats.isDirectory()) {
          carpetas.push(archivo);
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo verificar ${archivo}: ${error.message}`);
      }
    }

    if (carpetas.length > 0) {
      console.log(`📂 Encontradas ${carpetas.length} subcarpetas`);
      return res.json(crearRespuestaExito(
        { carpetas, datosOrden, rutaPref },
        "Subcarpetas encontradas"
      ));
    }

    // Si no hay carpetas, procesar archivos directamente
    console.log(`📷 Procesando archivos directamente...`);
    
    try {
      // Convertir PDFs a imágenes
      const archivosPDF = archivos.filter(archivo => /\.pdf$/i.test(archivo));
      
      for (const archivo of archivosPDF) {
        try {
          let rutaPDF = path.join(rutaCompleta, archivo);
          let opciones = {
            format: "jpeg",
            out_dir: rutaCompleta,
            out_prefix: path.basename(archivo, path.extname(archivo)),
            page: null,
          };

          await pdf2img.convert(rutaPDF, opciones);
          console.log(`✓ PDF convertido: ${archivo}`);
        } catch (pdfError) {
          console.warn(`⚠️ No se pudo convertir el PDF ${archivo}: ${pdfError.message}`);
        }
      }

      // Actualizar lista de archivos
      const archivosActualizados = await fsPromises.readdir(rutaCompleta);
      const archivosImagen = archivosActualizados.filter(archivo => 
        /\.(jpg|jpeg|png|gif)$/i.test(archivo)
      );

      if (archivosImagen.length === 0) {
        return res.status(404).json(crearRespuestaError(
          "NO_IMAGENES_ENCONTRADAS",
          "No se encontraron imágenes en la carpeta",
          { ruta: rutaCompleta }
        ));
      }

      console.log(`📸 Encontradas ${archivosImagen.length} imágenes`);

      // Copiar y comprimir imágenes
      const erroresCopia = [];
      const promesasDeCopiado = archivosImagen.map(async (imagen) => {
        try {
          const rutaOrigen = path.join(rutaCompleta, imagen);
          const rutaDestino = path.join(carpetaTemporal, imagen);
          await copiarYComprimirFoto(rutaOrigen, rutaDestino);
          return true;
        } catch (error) {
          erroresCopia.push({ imagen, error: error.message });
          return false;
        }
      });

      await Promise.all(promesasDeCopiado);

      if (erroresCopia.length > 0) {
        console.warn(`⚠️ Errores al copiar ${erroresCopia.length} imágenes`);
      }

      // Analizar metadatos
      const erroresAnalisis = [];
      const promesasAnalisis = archivosImagen.map(async (imagen) => {
        try {
          return await analizarMetadatosImagen(path.join(carpetaTemporal, imagen));
        } catch (error) {
          erroresAnalisis.push({ imagen, error: error.message });
          return null;
        }
      });

      const resultadosAnalisis = await Promise.all(promesasAnalisis);
      const imagenes = resultadosAnalisis.filter(resultado => resultado !== null);

      if (imagenes.length === 0) {
        return res.status(500).json(crearRespuestaError(
          "ERROR_PROCESAR_IMAGENES",
          "No se pudo procesar ninguna imagen",
          { erroresCopia, erroresAnalisis }
        ));
      }

      console.log(`✓ Procesadas ${imagenes.length} imágenes correctamente`);

      // Abrir carpeta temporal
      setTimeout(() => {
        exec(`start "" "C:\\imagenesPlantillaR13"`, (error) => {
          if (error) {
            console.error("Error al abrir la carpeta temporal:", error);
          }
        });
      }, 1000);

      const respuesta = crearRespuestaExito(
        { imagenes, datosOrden, rutaPref },
        `Procesadas ${imagenes.length} imágenes exitosamente`
      );

      if (erroresCopia.length > 0 || erroresAnalisis.length > 0) {
        respuesta.advertencias = {
          erroresCopia: erroresCopia.length,
          erroresAnalisis: erroresAnalisis.length,
          detalles: { erroresCopia, erroresAnalisis }
        };
      }

      return res.json(respuesta);

    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_PROCESAR_ARCHIVOS",
        "Error al procesar los archivos",
        { error: error.message }
      ));
    }

  } catch (error) {
    console.error("Error inesperado en buscarOrden:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

const copiarYComprimirFotosDesdeCarpeta = async (req, res) => {
  const { rutaSeleccionada } = req.body;
  const carpetaTemporal = "C:\\imagenesPlantillaR13";

  console.log(`📂 Copiando fotos desde: ${rutaSeleccionada}`);

  try {
    if (!rutaSeleccionada) {
      return res.status(400).json(crearRespuestaError(
        "RUTA_NO_ESPECIFICADA",
        "La ruta de la carpeta no fue especificada"
      ));
    }

    // Verificar que la ruta existe
    try {
      await fsPromises.access(rutaSeleccionada, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "CARPETA_NO_ENCONTRADA",
        "La carpeta seleccionada no existe",
        { ruta: rutaSeleccionada }
      ));
    }

    // Leer archivos de la carpeta
    let archivos;
    try {
      archivos = await fsPromises.readdir(rutaSeleccionada);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_CARPETA",
        "No se pudo leer el contenido de la carpeta",
        { ruta: rutaSeleccionada, error: error.message }
      ));
    }

    const archivosImagen = archivos.filter(archivo => 
      /\.(jpg|jpeg|png|gif)$/i.test(archivo)
    );

    if (archivosImagen.length === 0) {
      return res.status(404).json(crearRespuestaError(
        "NO_IMAGENES_ENCONTRADAS",
        "No se encontraron imágenes en la carpeta seleccionada",
        { ruta: rutaSeleccionada }
      ));
    }

    console.log(`📸 Encontradas ${archivosImagen.length} imágenes`);

    // Copiar y comprimir imágenes
    const erroresCopia = [];
    const promesasDeCopiado = archivosImagen.map(async (imagen) => {
      try {
        const rutaOrigen = path.join(rutaSeleccionada, imagen);
        const rutaDestino = path.join(carpetaTemporal, imagen);
        await copiarYComprimirFoto(rutaOrigen, rutaDestino);
        return true;
      } catch (error) {
        erroresCopia.push({ imagen, error: error.message });
        return false;
      }
    });

    await Promise.all(promesasDeCopiado);

    // Analizar metadatos
    const erroresAnalisis = [];
    const promesasAnalisis = archivosImagen.map(async (imagen) => {
      try {
        return await analizarMetadatosImagen(path.join(carpetaTemporal, imagen));
      } catch (error) {
        erroresAnalisis.push({ imagen, error: error.message });
        return null;
      }
    });

    const resultadosAnalisis = await Promise.all(promesasAnalisis);
    const imagenes = resultadosAnalisis.filter(resultado => resultado !== null);

    if (imagenes.length === 0) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_PROCESAR_IMAGENES",
        "No se pudo procesar ninguna imagen",
        { erroresCopia, erroresAnalisis }
      ));
    }

    console.log(`✓ Procesadas ${imagenes.length} imágenes correctamente`);

    const respuesta = crearRespuestaExito(
      { imagenes },
      `Fotos copiadas exitosamente: ${imagenes.length} imágenes`
    );

    if (erroresCopia.length > 0 || erroresAnalisis.length > 0) {
      respuesta.advertencias = {
        erroresCopia: erroresCopia.length,
        erroresAnalisis: erroresAnalisis.length,
        detalles: { erroresCopia, erroresAnalisis }
      };
    }

    return res.json(respuesta);

  } catch (error) {
    console.error("Error inesperado en copiarYComprimirFotosDesdeCarpeta:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

// ***********RUTAS FINALES PARA CONTRUIR CAMINO*******************

const destinos = {
  0: "00 PED",
  1: "01 TD",
  2: "02 PIC-PTTO",
  3: "03 FAB",
  4: "04 MONT",
  5: "05 CFO",
  6: "06 PREF",
  7: "07 OBJ",
  8: "08 COMUNICADOS",
  9: "09 PRL",
  10: "10 FRA-PRO",
};

// *********************FUNCION PARA COPIAR LOS TXT DE REPSOL A TEMP************************
const copiarArchivo = async (req, res) => {
  console.log("📋 Iniciando copia de archivos de configuración...");
  
  const archivosACopiar = [
    {
      origen: "\\\\KYRIOS\\Repsol\\OFYTIPOS.txt",
      destino: "C:/TEMP/OFYTIPOS.txt",
      nombre: "OFYTIPOS.txt"
    },
    {
      origen: "\\\\KYRIOS\\Repsol\\OFYTIPOS2.txt",
      destino: "C:/TEMP/OFYTIPOS2.txt",
      nombre: "OFYTIPOS2.txt"
    },
    {
      origen: "\\\\KYRIOS\\Repsol\\MisEstaciones.txt",
      destino: "C:/TEMP/MisEstaciones.txt",
      nombre: "MisEstaciones.txt"
    }
  ];

  try {
    const errores = [];
    const exitos = [];

    // Función para copiar un archivo específico
    const copiarUnArchivo = async (config) => {
      try {
        // Verificar que el archivo origen existe
        await fsPromises.access(config.origen, fs.constants.F_OK);
        
        // Leer archivo con codificación latin1
        const contenidoAnsi = await fsPromises.readFile(config.origen, "latin1");
        
        // Escribir con codificación UTF-8
        await fsPromises.writeFile(config.destino, contenidoAnsi, "utf8");
        
        console.log(`✓ Archivo copiado: ${config.nombre}`);
        exitos.push(config.nombre);
      } catch (error) {
        console.error(`✗ Error al copiar ${config.nombre}:`, error.message);
        errores.push({ archivo: config.nombre, error: error.message });
      }
    };

    // Copiar todos los archivos
    for (const config of archivosACopiar) {
      await copiarUnArchivo(config);
    }

    if (errores.length === 0) {
      console.log("✅ Todos los archivos copiados exitosamente");
      return res.json(crearRespuestaExito(
        { archivosCopias: exitos },
        "Archivos de configuración actualizados correctamente"
      ));
    } else if (exitos.length > 0) {
      console.log(`⚠️ ${exitos.length} archivos copiados, ${errores.length} errores`);
      return res.status(207).json({
        success: true,
        mensaje: "Archivos copiados parcialmente",
        datos: { archivosCopias: exitos },
        advertencias: { errores }
      });
    } else {
      console.log("❌ No se pudo copiar ningún archivo");
      return res.status(500).json(crearRespuestaError(
        "ERROR_COPIAR_ARCHIVOS",
        "No se pudo copiar ningún archivo de configuración",
        { errores }
      ));
    }

  } catch (error) {
    console.error("Error inesperado en copiarArchivo:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

// *****************LIMPIAR LA CARPETA DE C:\imagenesPlantillaR13 **************

const limpiarCarpetaTemporal = async (req, res) => {
  const carpetaTemporal = "C:\\imagenesPlantillaR13";
  
  console.log("🧹 Iniciando limpieza de la carpeta temporal...");
  
  try {
    // Verificar que la carpeta existe
    try {
      await fsPromises.access(carpetaTemporal, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "CARPETA_NO_ENCONTRADA",
        "La carpeta temporal no existe",
        { ruta: carpetaTemporal }
      ));
    }

    // Leer contenido de la carpeta
    let archivos;
    try {
      archivos = await fsPromises.readdir(carpetaTemporal);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_CARPETA",
        "No se pudo leer el contenido de la carpeta temporal",
        { error: error.message }
      ));
    }

    if (archivos.length === 0) {
      console.log("📂 La carpeta temporal ya está vacía");
      return res.json(crearRespuestaExito(
        { archivosEliminados: 0 },
        "La carpeta temporal ya está vacía"
      ));
    }

    console.log(`🗑️ Eliminando ${archivos.length} archivos...`);

    // Eliminar archivos
    const errores = [];
    const promesasEliminacion = archivos.map(async (archivo) => {
      try {
        await fsPromises.unlink(path.join(carpetaTemporal, archivo));
        console.log(`✓ Eliminado: ${archivo}`);
        return true;
      } catch (error) {
        console.error(`✗ Error al eliminar ${archivo}:`, error.message);
        errores.push({ archivo, error: error.message });
        return false;
      }
    });

    await Promise.all(promesasEliminacion);

    const archivosEliminados = archivos.length - errores.length;

    if (errores.length === 0) {
      console.log("✅ Carpeta limpiada completamente");
      return res.json(crearRespuestaExito(
        { archivosEliminados },
        `Carpeta limpiada con éxito: ${archivosEliminados} archivos eliminados`
      ));
    } else {
      console.log(`⚠️ ${archivosEliminados} archivos eliminados, ${errores.length} errores`);
      return res.status(207).json({
        success: true,
        mensaje: "Carpeta limpiada parcialmente",
        datos: { archivosEliminados },
        advertencias: { errores }
      });
    }

  } catch (error) {
    console.error("Error inesperado en limpiarCarpetaTemporal:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

// ******************BOTON PARA VER LO QUE HAY EN LA CARPETA TEMPORAL******************

const leerCarpetaTemporal = async (req, res) => {
  const carpetaTemporal = "C:\\imagenesPlantillaR13";
  
  console.log("👀 Leyendo contenido de la carpeta temporal...");
  
  try {
    // Verificar que la carpeta existe
    try {
      await fsPromises.access(carpetaTemporal, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "CARPETA_NO_ENCONTRADA",
        "La carpeta temporal no existe",
        { ruta: carpetaTemporal }
      ));
    }

    // Leer archivos
    let archivos;
    try {
      archivos = await fsPromises.readdir(carpetaTemporal);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_CARPETA",
        "No se pudo leer el contenido de la carpeta temporal",
        { error: error.message }
      ));
    }

    // Filtrar solo imágenes
    const imagenes = archivos.filter(archivo => 
      /\.(jpg|jpeg|png|gif)$/i.test(archivo)
    );

    if (imagenes.length === 0) {
      console.log("📂 No hay imágenes en la carpeta temporal");
      return res.json(crearRespuestaExito(
        { imagenes: [] },
        "La carpeta temporal no contiene imágenes"
      ));
    }

    const rutas = imagenes.map(archivo => `/imagenesPlantillaR13/${archivo}`);
    
    console.log(`📸 Encontradas ${imagenes.length} imágenes`);
    
    return res.json(crearRespuestaExito(
      { imagenes: rutas },
      `Encontradas ${imagenes.length} imágenes en la carpeta temporal`
    ));

  } catch (error) {
    console.error("Error inesperado en leerCarpetaTemporal:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

// Enviamos la imagenes desde el frontend al Back-end , mandamos el pdf a temp => se comprime y se envia
// a la carpeta 06 de la orden .
const procesarPDF = async (req, res) => {
  console.log("📄 Iniciando procesamiento de PDF...");
  
  try {
    const { rutaArchivo, rutaPref } = req.body;

    // Validaciones
    if (!rutaArchivo || !rutaPref) {
      return res.status(400).json(crearRespuestaError(
        "PARAMETROS_FALTANTES",
        "Faltan parámetros necesarios para procesar el PDF",
        { rutaArchivo: !!rutaArchivo, rutaPref: !!rutaPref }
      ));
    }

    // Verificar que el archivo PDF existe
    try {
      await fsPromises.access(rutaArchivo, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "ARCHIVO_PDF_NO_ENCONTRADO",
        "El archivo PDF no existe",
        { ruta: rutaArchivo }
      ));
    }

    // Construir ruta de destino
    let segmentosRuta = rutaPref.split("\\");
    segmentosRuta[segmentosRuta.length - 1] = "06 PREF";
    let rutaLimpia = segmentosRuta.join("\\");
    
    console.log(`📁 Ruta de destino: ${rutaLimpia}`);

    // Verificar que la carpeta de destino existe
    try {
      await fsPromises.access(rutaLimpia, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "CARPETA_DESTINO_NO_ENCONTRADA",
        "La carpeta de destino no existe",
        { ruta: rutaLimpia }
      ));
    }

    const inputPath = rutaArchivo;
    const outputPath = path.join(rutaLimpia, path.basename(rutaArchivo));

    // Comando para ejecutar Ghostscript
    const gsCommand = `gswin64c -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;

    console.log("🔄 Comprimiendo PDF...");

    // Ejecutar compresión
    await new Promise((resolve, reject) => {
      exec(gsCommand, (error, stdout, stderr) => {
        if (error) {
          console.error("✗ Error al comprimir el PDF:", error.message);
          reject(new Error(`Error al comprimir el PDF: ${error.message}`));
        } else {
          console.log("✓ PDF comprimido exitosamente");
          resolve(stdout);
        }
      });
    });

    // Verificar que el archivo comprimido se creó
    try {
      await fsPromises.access(outputPath, fs.constants.F_OK);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ARCHIVO_COMPRIMIDO_NO_CREADO",
        "El archivo comprimido no se pudo crear",
        { rutaEsperada: outputPath }
      ));
    }

    // Eliminar el archivo original en C:\TEMP
    try {
      await fsPromises.unlink(inputPath);
      console.log("✓ Archivo original eliminado");
    } catch (error) {
      console.warn(`⚠️ No se pudo eliminar el archivo original: ${error.message}`);
    }

    // Abrir la carpeta donde se guardó el PDF
    exec(`start "" "${rutaLimpia}"`, (errorAbrir) => {
      if (errorAbrir) {
        console.error("Error al abrir la carpeta:", errorAbrir);
      } else {
        console.log("📂 Carpeta abierta exitosamente");
      }
    });

    return res.json(crearRespuestaExito(
      { 
        archivoOriginal: inputPath,
        archivoComprimido: outputPath,
        carpetaDestino: rutaLimpia
      },
      "PDF procesado y guardado exitosamente"
    ));

  } catch (error) {
    console.error("Error inesperado en procesarPDF:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

// ***************************manejo de rutas en clientes varios*********************************

const configuracionesClientes = {
  OCC: {
    basePath: "\\\\kyrios\\ClientesVarios\\CATALANA OCCIDENTE - OCC\\",
    noCampanaPath: "ES\\00-Obras\\",
    campanaPath: "01-CAMPAÑAS {año}\\OCCIMGOFI\\",
  },
  NGB: {
    basePath: "\\\\kyrios\\ClientesVarios\\ABANCA - NGB\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  ADL: {
    basePath: "\\\\kyrios\\ClientesVarios\\ADESLAS - ADL\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  BOS: {
    basePath: "\\\\kyrios\\ClientesVarios\\Bosch - BOS\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  LCX: {
    basePath: "\\\\kyrios\\ClientesVarios\\CAIXA BANK - LCC\\",
    noCampanaPath: "ES\\00-Obras\\",
    campanaPath: "01-CAMPAÑAS {año}\\",
  },
  LCC: {
    basePath: "\\\\kyrios\\ClientesVarios\\CAIXA BANK - LCC\\",
    noCampanaPath: "ES\\00-Obras\\",
    campanaPath: "01-CAMPAÑAS {año}\\",
  },
  GTE: {
    basePath: "\\\\kyrios\\ClientesVarios\\ECHEVERRIA - GTE\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  FDS: {
    basePath: "\\\\KYRIOS\\ClientesVarios\\FEDEX - FDS\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  TNT: {
    basePath: "\\\\KYRIOS\\ClientesVarios\\TNT EXPRESS WORLDWIDE - TNT\\",
    noCampanaPath: "ES\\00-Obras\\",
  },
  OYS: {
    basePath: "\\\\KYRIOSClientesVariosSEAT - OYS",
    noCampanaPath: "ES\\00-Obras\\",
  },
  SEA: {
    basePath: "\\\\KYRIOSClientesVariosSEAT - SEA",
    noCampanaPath: "ES\\00-Obras\\",
  },
};

const buscarOrdenCv = async (req, res) => {
  const orden = req.params.numeroOF;
  const destino = req.body.destino;

  console.log(`🔍 Buscando orden de cliente vario: ${orden}`);

  try {
    // Validaciones iniciales
    if (!orden) {
      return res.status(400).json(crearRespuestaError(
        "ORDEN_INVALIDA",
        "La orden ingresada no es válida"
      ));
    }

    if (orden.length !== 8) {
      return res.status(400).json(crearRespuestaError(
        "ORDEN_FORMATO_INVALIDO",
        "La orden debe tener exactamente 8 dígitos"
      ));
    }

    // Verificar que existe el archivo de órdenes de clientes varios
    try {
      await fsPromises.access("C:\\TEMP\\OFYTIPOS2.txt", fs.constants.F_OK);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ARCHIVO_ORDENES_CV_NO_ENCONTRADO",
        "No se encontró el archivo de órdenes de clientes varios",
        { archivo: "C:\\TEMP\\OFYTIPOS2.txt" }
      ));
    }

    // Leer archivo de órdenes
    let data;
    try {
      data = await fsPromises.readFile("C:\\TEMP\\OFYTIPOS2.txt", "utf8");
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_ORDENES_CV",
        "No se pudo leer el archivo de órdenes de clientes varios",
        { error: error.message }
      ));
    }

    // Buscar la orden
    const lineas = data.split("\n");
    let lineaEncontrada = null;

    for (const linea of lineas) {
      const campos = linea.split(",");
      if (campos[0] === orden) {
        lineaEncontrada = campos;
        break;
      }
    }

    if (!lineaEncontrada) {
      return res.status(404).json(crearRespuestaError(
        "ORDEN_CV_NO_ENCONTRADA",
        `La orden ${orden} no fue encontrada en clientes varios`
      ));
    }

    console.log(`✓ Orden encontrada: ${orden}`);

    // Validar que la línea tenga todos los campos necesarios
    if (lineaEncontrada.length < 10) {
      return res.status(500).json(crearRespuestaError(
        "ORDEN_CV_DATOS_INCOMPLETOS",
        "Los datos de la orden de cliente vario están incompletos",
        { campos: lineaEncontrada.length, esperados: 10 }
      ));
    }

    const cliente = lineaEncontrada[6];
    const configuracion = configuracionesClientes[cliente];

    if (!configuracion) {
      return res.status(404).json(crearRespuestaError(
        "CONFIGURACION_CLIENTE_NO_ENCONTRADA",
        `No se encontró configuración para el cliente: ${cliente}`,
        { cliente }
      ));
    }

    console.log(`✓ Cliente configurado: ${cliente}`);

    // Construir ruta base
    let rutaBase = configuracion.basePath;

    if (lineaEncontrada[9] === "S") {
      if (!configuracion.campanaPath) {
        return res.status(500).json(crearRespuestaError(
          "CAMPAÑA_NO_CONFIGURADA",
          `El cliente ${cliente} no tiene configurada la ruta de campañas`,
          { cliente }
        ));
      }
      rutaBase += configuracion.campanaPath.replace("{año}", lineaEncontrada[8]);
    } else {
      rutaBase += configuracion.noCampanaPath;
    }

    // Construir ruta completa
    let rutaCompleta = `${rutaBase}${lineaEncontrada[4]}\\${lineaEncontrada[3]} - ${lineaEncontrada[5]}\\${lineaEncontrada[0].slice(0, 4)}-${lineaEncontrada[0].slice(4)} - ${lineaEncontrada[1]}`;

    if (destino && destinos.hasOwnProperty(destino)) {
      rutaCompleta += `\\${destinos[destino]}`;
    }

    console.log(`📁 Ruta construida: ${rutaCompleta}`);

    // Verificar que la ruta existe
    try {
      await fsPromises.access(rutaCompleta, fs.constants.F_OK);
    } catch (error) {
      return res.status(404).json(crearRespuestaError(
        "CARPETA_ORDEN_CV_NO_ENCONTRADA",
        `La carpeta de la orden ${orden} no existe`,
        { rutaEsperada: rutaCompleta }
      ));
    }

    // Leer archivos de la carpeta
    let archivos;
    try {
      archivos = await fsPromises.readdir(rutaCompleta);
    } catch (error) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_LEER_CARPETA_CV",
        "No se pudo leer el contenido de la carpeta",
        { ruta: rutaCompleta, error: error.message }
      ));
    }

    const archivosImagen = archivos.filter(archivo => 
      /\.(jpg|jpeg|png|gif)$/i.test(archivo)
    );

    if (archivosImagen.length === 0) {
      return res.status(404).json(crearRespuestaError(
        "NO_IMAGENES_ENCONTRADAS_CV",
        "No se encontraron imágenes en la carpeta",
        { ruta: rutaCompleta }
      ));
    }

    console.log(`📸 Encontradas ${archivosImagen.length} imágenes`);

    // Procesar imágenes
    const erroresProcesamiento = [];
    const imagenes = await Promise.all(
      archivosImagen.map(async (imagen) => {
        try {
          const rutaOrigen = path.join(rutaCompleta, imagen);
          const rutaDestino = path.join("C:\\imagenesPlantillaR13", imagen);
          
          // Copiar archivo
          await copiarFotos(rutaOrigen, rutaDestino);

          // Obtener metadatos
          const metadata = await sharp(rutaDestino).metadata();
          console.log(`📸 Procesando: ${imagen}, Ancho: ${metadata.width}, Alto: ${metadata.height}`);
          
          // Determinar orientación
          let esHorizontal = false;
          if (metadata.orientation === 1 || metadata.orientation === 3) {
            esHorizontal = metadata.width > metadata.height;
          } else if (metadata.orientation === 6 || metadata.orientation === 8) {
            esHorizontal = metadata.height > metadata.width;
          } else {
            esHorizontal = metadata.width > metadata.height;
          }

          return {
            url: `/imagenesPlantillaR13/${imagen}`,
            esHorizontal,
          };
        } catch (error) {
          erroresProcesamiento.push({ imagen, error: error.message });
          return null;
        }
      })
    );

    const imagenesProcesadas = imagenes.filter(img => img !== null);

    if (imagenesProcesadas.length === 0) {
      return res.status(500).json(crearRespuestaError(
        "ERROR_PROCESAR_IMAGENES_CV",
        "No se pudo procesar ninguna imagen",
        { errores: erroresProcesamiento }
      ));
    }

    const datosOrden = {
      orden: lineaEncontrada[0],
      provincia: lineaEncontrada[4],
      direccion: lineaEncontrada[5],
      abreviatura: lineaEncontrada[6],
      codocc: lineaEncontrada[3],
    };

    console.log(`✓ Procesadas ${imagenesProcesadas.length} imágenes correctamente`);

    // Abrir carpeta temporal
    setTimeout(() => {
      exec(`start "" "C:\\imagenesPlantillaR13"`, (error) => {
        if (error) {
          console.error("Error al abrir la carpeta temporal:", error);
        }
      });
    }, 1000);

    const respuesta = crearRespuestaExito(
      { 
        imagenes: imagenesProcesadas, 
        datosOrden, 
        rutapref: rutaCompleta 
      },
      `Procesadas ${imagenesProcesadas.length} imágenes de cliente vario`
    );

    if (erroresProcesamiento.length > 0) {
      respuesta.advertencias = {
        erroresProcesamiento: erroresProcesamiento.length,
        detalles: erroresProcesamiento
      };
    }

    return res.json(respuesta);

  } catch (error) {
    console.error("Error inesperado en buscarOrdenCv:", error);
    return res.status(500).json(crearRespuestaError(
      "ERROR_INTERNO",
      "Error interno del servidor",
      { error: error.message }
    ));
  }
};

module.exports = {
  buscarOrden,
  copiarArchivo,
  limpiarCarpetaTemporal,
  leerCarpetaTemporal,
  procesarPDF,
  buscarOrdenCv,
  copiarYComprimirFotosDesdeCarpeta
};