import { Component, NgZone } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { PlantillaService } from 'src/shared/plantilla.service';
import { ToastrService } from 'ngx-toastr';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ChangeDetectorRef } from '@angular/core';

declare global {
  interface Window {
    require: any;
  }
}
const fs = window.require('fs');

let ipcRenderer: any = null;
if (window.require) {
  const electron = window.require('electron');
  ipcRenderer = electron.ipcRenderer;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent {
  formulario!: FormGroup;

  destinos = [
    { key: '0', value: '00 PED' },
    { key: '1', value: '01 TD' },
    { key: '2', value: '02 PIC-PTTO' },
    { key: '3', value: '03 FAB' },
    { key: '4', value: '04 MONT' },
    { key: '5', value: '05 CFO' },
    { key: '6', value: '06 PREF' },
    { key: '7', value: '07 OBJ' },
    { key: '8', value: '08 COMUNICADOS' },
    { key: '9', value: '09 PRL' },
    { key: '10', value: '10 FRA-PRO' },
  ];

  destinosKeys = Object.keys(this.destinos);
  ordenCompleta: string = '';
  destinoSeleccionado: string = '';
  mostrarSelectorDestino = false;
  imageUrls: { url: string; esHorizontal: boolean; fechaCaptura: string; rotation: number }[] = [];

  baseUrl: string = '';
  rutaCompleta: string = '';
  datosOrden: any;
  rutaPref: string = '';
  carpetas: string[] = [];
  cargandoPDF = false;
  cargandoImagenes = false; // Nueva variable para el loader de imágenes
  ordenBuscada = false; 

  imagenesAntes: { url: string; esHorizontal: boolean }[] = [];
  imagenesDurante: { url: string; esHorizontal: boolean }[] = [];
  imagenesDespues: { url: string; esHorizontal: boolean }[] = [];
  imagenesAlbaran: { url: string; esHorizontal: boolean }[] = [];

  gruposAntes: { url: string; esHorizontal: boolean }[][] = [];
  gruposDurante: { url: string; esHorizontal: boolean }[][] = [];
  gruposDespues: { url: string; esHorizontal: boolean }[][] = [];
  gruposAlbaran: { url: string; esHorizontal: boolean }[][] = [];

  public claseFoto: string = 'espacioIndvFoto';

  constructor(
    private fb: FormBuilder,
    private plantillaService: PlantillaService,
    private router: Router,
    private toastr: ToastrService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    this.formulario = this.fb.group({
      input1: [''],
      input2: [''],
      input3: [''],
      input4: [''],
      input5: [''],
      input6: [''],
      input7: [''],
      input8: [''],
      destino: [''],
    });
  }

  // Método para manejar errores del backend
  private manejarError(error: any) {
    console.error('Error completo:', error);
    console.error('Error.error:', error.error);
    console.error('Error.status:', error.status);
    
    let mensaje = 'Error desconocido';
    let titulo = 'Error';
    
    // Si el error tiene la estructura nueva del backend
    if (error.error?.error?.codigo) {
      const errorInfo = error.error.error;
      mensaje = errorInfo.mensaje || 'Error desconocido';
      titulo = this.obtenerTituloError(errorInfo.codigo);
      
      // Agregar detalles si están disponibles
      if (errorInfo.detalles) {
        if (errorInfo.detalles.rutaEsperada) {
          mensaje += `\nRuta esperada: ${errorInfo.detalles.rutaEsperada}`;
        }
        if (errorInfo.detalles.rutaAnterior) {
          mensaje += `\nSe abrió: ${errorInfo.detalles.rutaAnterior}`;
        }
      }
    } 
    // Si el error tiene mensaje directo del backend (formato antiguo)
    else if (error.error && typeof error.error === 'string') {
      mensaje = error.error;
    }
    // Si el error tiene mensaje en error.message
    else if (error.error?.message) {
      mensaje = error.error.message;
    }
    // Si el error tiene mensaje en error.mensaje
    else if (error.error?.mensaje) {
      mensaje = error.error.mensaje;
    }
    // Si es un error HTTP con mensaje específico
    else if (error.message) {
      mensaje = error.message;
    }
    // Si el backend devolvió un mensaje de texto simple
    else if (error.error && typeof error.error === 'object') {
      // Intentar encontrar cualquier propiedad que contenga el mensaje
      if (error.error.error && typeof error.error.error === 'string') {
        mensaje = error.error.error;
      } else if (error.error.msg) {
        mensaje = error.error.msg;
      }
    }
    
    // Si el mensaje es muy genérico, intentar construir uno más específico
    if (mensaje === 'Orden no encontrada' && this.ordenCompleta) {
      mensaje = `La orden ${this.ordenCompleta} no fue encontrada en el sistema`;
    } else if (mensaje === 'Error desconocido' && error.status === 404) {
      mensaje = `No se encontró la orden ${this.ordenCompleta}`;
    }
    
    console.log('Mensaje final:', mensaje);
    
    // Determinar el tipo de notificación según el código de estado
    if (error.status === 404) {
      this.toastr.warning(mensaje, 'No encontrado');
    } else if (error.status === 400) {
      this.toastr.error(mensaje, 'Datos incorrectos');
    } else if (error.status === 500) {
      this.toastr.error(mensaje, 'Error del servidor');
    } else {
      this.toastr.error(mensaje, titulo);
    }
  }
  
  // Método auxiliar para obtener títulos de error más amigables
  private obtenerTituloError(codigo: string): string {
    const titulos: { [key: string]: string } = {
      'ORDEN_NO_ENCONTRADA': 'Orden no encontrada',
      'ESTACION_NO_ENCONTRADA': 'Estación no encontrada',
      'CARPETA_ORDEN_NO_ENCONTRADA': 'Carpeta no encontrada',
      'TIPO_CLIENTE_NO_RECONOCIDO': 'Cliente no reconocido',
      'NO_IMAGENES_ENCONTRADAS': 'Sin imágenes',
      'ARCHIVOS_FALTANTES': 'Archivos faltantes',
      'ERROR_INTERNO': 'Error interno',
      'ORDEN_INVALIDA': 'Orden inválida',
      'ORDEN_FORMATO_INVALIDO': 'Formato incorrecto'
    };
    
    return titulos[codigo] || 'Error';
  }

  // Método para manejar respuestas exitosas
  private manejarRespuestaExitosa(respuesta: any): any {
    // Si la respuesta tiene la estructura nueva del backend
    if (respuesta.success !== undefined) {
      if (respuesta.success) {
        if (respuesta.mensaje) {
          this.toastr.success(respuesta.mensaje);
        }
        
        // Mostrar advertencias si existen
        if (respuesta.advertencias) {
          if (respuesta.advertencias.erroresCopia > 0) {
            this.toastr.warning(`${respuesta.advertencias.erroresCopia} imágenes no pudieron copiarse`);
          }
          if (respuesta.advertencias.erroresAnalisis > 0) {
            this.toastr.warning(`${respuesta.advertencias.erroresAnalisis} imágenes no pudieron analizarse`);
          }
        }
        
        return respuesta.datos;
      } else {
        this.manejarError({ error: respuesta });
        return null;
      }
    } else {
      // Respuesta en formato antiguo
      return respuesta;
    }
  }

  onKeyup(event: any) {
    const inputId = event.target.id;
    const inputValue = event.target.value;

    // Mover al siguiente campo si se ingresa un número
    if (inputValue.length === 1) {
      const currentInputIndex = parseInt(inputId.replace('input', ''));
      const nextInput = document.getElementById(`input${currentInputIndex + 1}`);
      if (nextInput) {
        nextInput.focus();
      }
    }
    // si eliminas un numero retrocede un cuadro y asi sucesivamente
    else if (event.key === 'Backspace') {
      const currentInputIndex = parseInt(inputId.replace('input', ''));
      const prevInput = document.getElementById(`input${currentInputIndex - 1}`);
      if (prevInput) {
        prevInput.focus();
      }
    }

    // Verifica que el formulario y sus controles existan
    if (this.formulario && this.formulario.controls) {
      // Construir la orden completa
      this.ordenCompleta = '';
      for (let i = 1; i <= 8; i++) {
        const control = this.formulario.get('input' + i);
        if (control) {
          this.ordenCompleta += control.value;
        }
      }

      // Muestra el selector de destino si la orden está completa
      if (this.ordenCompleta.length === 8) {
        this.mostrarSelectorDestino = true;
      }
    }
  }

  onSubmit() {
    console.log('Orden completa: ', this.ordenCompleta);
    const controlDestino = this.formulario.get('destino');
    const destinoSeleccionado = controlDestino ? controlDestino.value.toString() : null;
    console.log('Destino seleccionado: ', destinoSeleccionado);

    if (this.ordenCompleta.length === 8) {
      this.cargandoImagenes = true; // Activar loader
      
      this.plantillaService.buscarOrden(this.ordenCompleta, destinoSeleccionado).subscribe({
        next: (respuesta) => {
          console.log('Datos recibidos de la API:', respuesta);
          
          const datos = this.manejarRespuestaExitosa(respuesta);
          if (datos) {
            this.datosOrden = datos.datosOrden;
            this.carpetas = datos.carpetas || [];
            this.rutaPref = datos.rutaPref;
            this.ordenBuscada = true;

            if (this.carpetas.length === 0 && datos.imagenes) {
              // Si no hay carpetas y hay imágenes, procesarlas directamente
              this.procesarImagenes(datos.imagenes);
              this.cargandoImagenes = false; // Desactivar loader
            } else if (this.carpetas.length > 0) {
              this.toastr.info('Seleccione una carpeta para copiar las fotos.');
              this.cargandoImagenes = false; // Desactivar loader
            } else {
              this.cargandoImagenes = false; // Desactivar loader
            }
          } else {
            this.cargandoImagenes = false; // Desactivar loader en caso de error
          }
        },
        error: (error) => {
          this.manejarError(error);
          this.cargandoImagenes = false; // Desactivar loader en caso de error
        },
      });
    } else {
      this.toastr.error('La orden no está completa');
    }
  }

  onSubmitClientesVarios() {
    console.log('Orden completa: ', this.ordenCompleta);
    const controlDestino = this.formulario.get('destino');
    const destinoSeleccionado = controlDestino ? controlDestino.value.toString() : null;
    console.log('Destino seleccionado: ', destinoSeleccionado);

    if (this.ordenCompleta.length === 8) {
      this.cargandoImagenes = true; // Activar loader
      
      this.plantillaService.buscarOrdenCv(this.ordenCompleta, destinoSeleccionado).subscribe({
        next: (respuesta) => {
          console.log('Datos recibidos de la API:', respuesta);
          
          const datos = this.manejarRespuestaExitosa(respuesta);
          if (datos) {
            this.datosOrden = datos.datosOrden;
            this.rutaPref = datos.rutapref;
            this.ordenBuscada = true;

            if (datos.imagenes) {
              this.procesarImagenes(datos.imagenes);
            }
          }
          
          this.cargandoImagenes = false; // Desactivar loader
        },
        error: (error) => {
          this.manejarError(error);
          this.cargandoImagenes = false; // Desactivar loader en caso de error
        },
      });
    } else {
      this.toastr.error('La orden no está completa');
    }
  }

  seleccionarCarpeta(carpeta: string) {
    const rutaSeleccionada = `${this.rutaPref}\\${carpeta}`;
    this.copiarFotos(rutaSeleccionada);
  }

  copiarFotos(rutaSeleccionada: string) {
    this.cargandoImagenes = true; // Activar loader
    
    this.plantillaService.copiarFotos(rutaSeleccionada).subscribe({
      next: (respuesta) => {
        console.log('Respuesta copiar fotos:', respuesta);
        
        const datos = this.manejarRespuestaExitosa(respuesta);
        if (datos && datos.imagenes) {
          this.procesarImagenes(datos.imagenes);
        }
        
        this.cargandoImagenes = false; // Desactivar loader
      },
      error: (error) => {
        this.manejarError(error);
        this.cargandoImagenes = false; // Desactivar loader en caso de error
      }
    });
  }

  // Método auxiliar para procesar imágenes
  private procesarImagenes(imagenes: any[]) {
    // Ordenar imágenes por fecha de captura
    imagenes.sort((a: { fechaCaptura?: string }, b: { fechaCaptura?: string }) => {
      const fechaA = a.fechaCaptura ? new Date(a.fechaCaptura.replace(/:/g, '-')) : new Date(0);
      const fechaB = b.fechaCaptura ? new Date(b.fechaCaptura.replace(/:/g, '-')) : new Date(0);
      return fechaA.getTime() - fechaB.getTime();
    });

    this.imageUrls = imagenes.map((imagen: any) => ({
      url: `http://localhost:3001${imagen.url}`,
      esHorizontal: imagen.esHorizontal,
      fechaCaptura: imagen.fechaCaptura || '',
      rotation: 0
    }));
  }

  limpiarCarpetaTemp() {
    this.plantillaService.limpiarCarpetaTemporal().subscribe({
      next: (respuesta) => {
        console.log('Respuesta limpiar carpeta:', respuesta);
        this.manejarRespuestaExitosa(respuesta);
      },
      error: (error) => {
        this.manejarError(error);
      },
    });
  }

  verCarpetaTemporal() {
    console.log('Entrando en temporal');
    this.plantillaService.leerCarpetaTemporal().subscribe({
      next: (respuesta) => {
        console.log('Respuesta leer carpeta:', respuesta);
        
        const datos = this.manejarRespuestaExitosa(respuesta);
        if (datos && datos.imagenes) {
          this.imageUrls = datos.imagenes.map((imagenUrl: string) => {
            const imagenOriginal = this.imageUrls.find((original) =>
              original.url.includes(imagenUrl)
            );
            return {
              url: `http://localhost:3001${imagenUrl}?v=${new Date().getTime()}`,
              esHorizontal: imagenOriginal ? imagenOriginal.esHorizontal : false,
              fechaCaptura: imagenOriginal ? imagenOriginal.fechaCaptura : '',
              rotation: 0
            };
          });
        }
      },
      error: (error) => {
        this.manejarError(error);
      },
    });
  }

  clasificacionAutomatica() {
    console.log("Clasificación automática iniciada");
  
    this.imageUrls.forEach((imageObj) => {
      console.log(`Procesando imagen: ${imageObj.url}`);
      const imagenCheckboxes = document.querySelectorAll(`input[type='checkbox'][data-image-url='${imageObj.url}']`);
  
      if (imagenCheckboxes.length === 0) {
        console.warn(`No se encontraron checkboxes para la imagen: ${imageObj.url}`);
      }
  
      imagenCheckboxes.forEach((checkbox) => {
        const checkboxElement = checkbox as HTMLInputElement;
        const parentDiv = checkboxElement.closest('.division');
        const checkboxLabel = parentDiv && parentDiv.textContent ? parentDiv.textContent.trim().toLowerCase() : null;
  
        if (checkboxLabel) {
          console.log(`Checkbox label: ${checkboxLabel}`);
  
          let categoria: string | null = null;
          if (imageObj.url.includes('FA') && checkboxLabel.includes('antes')) {
            categoria = 'antes';
          } else if (imageObj.url.includes('FD') && checkboxLabel.includes('durante')) {
            categoria = 'durante';
          } else if (imageObj.url.includes('FF') && checkboxLabel.includes('despues')) {
            categoria = 'despues';
          } else if (imageObj.url.includes('PT') && checkboxLabel.includes('albaran')) {
            categoria = 'albaran';
          }
  
          if (categoria) {
            checkboxElement.checked = true;
            console.log(`Marcado como '${categoria}': ${imageObj.url}`);
            
            const event = new Event('change', { bubbles: true });
            checkboxElement.dispatchEvent(event);
          }
        } else {
          console.warn(`No se encontró el texto del label para el checkbox de la imagen: ${imageObj.url}`);
        }
      });
    });
  }

  clasificarImagen(categoria: string, imagen: { url: string; esHorizontal: boolean }, event: Event) {
    const input = event.target as HTMLInputElement;
    const isChecked = input ? input.checked : false;
    const maximoImagenes = 50;
    let arrayActual: { url: string; esHorizontal: boolean }[];
  
    switch (categoria) {
      case 'antes':
        arrayActual = this.imagenesAntes;
        break;
      case 'durante':
        arrayActual = this.imagenesDurante;
        break;
      case 'despues':
        arrayActual = this.imagenesDespues;
        break;
      case 'albaran':
        arrayActual = this.imagenesAlbaran;
        break;
      default:
        console.error(`Categoría desconocida: ${categoria}`);
        return;
    }
  
    if (isChecked && arrayActual.length < maximoImagenes) {
      arrayActual.push(imagen);
    } else if (!isChecked) {
      this.removerImagenDeCategoria(categoria, imagen.url);
    } else {
      this.toastr.warning(`Se ha alcanzado el máximo de ${maximoImagenes} imágenes en la categoría '${categoria}'.`);
    }
  
    this.actualizarGrupos(categoria);
  }

  removerImagenDeCategoria(categoria: string, imageUrl: string) {
    let array: { url: string; esHorizontal: boolean }[];

    switch (categoria) {
      case 'antes':
        array = this.imagenesAntes;
        break;
      case 'durante':
        array = this.imagenesDurante;
        break;
      case 'despues':
        array = this.imagenesDespues;
        break;
      case 'albaran':
        array = this.imagenesAlbaran;
        break;
      default:
        console.error(`Categoría desconocida: ${categoria}`);
        return;
    }

    const index = array.findIndex((imagen) => imagen.url === imageUrl);
    if (index > -1) {
      array.splice(index, 1);
    }
    this.actualizarGrupos(categoria);
  }

  dividirEnGrupos(arr: { url: string; esHorizontal: boolean }[], tamanoGrupo: number): { url: string; esHorizontal: boolean }[][] {
    const grupos: { url: string; esHorizontal: boolean }[][] = [];
    let grupoActual: { url: string; esHorizontal: boolean }[] = [];
    let espacioOcupado = 0;
    
    for (let imagen of arr) {
      const espacioQueOcupa = imagen.esHorizontal ? 2 : 1;
      
      if (espacioOcupado + espacioQueOcupa > 4) {
        if (grupoActual.length > 0) {
          grupos.push(grupoActual);
          grupoActual = [];
          espacioOcupado = 0;
        }
      }
      
      grupoActual.push(imagen);
      espacioOcupado += espacioQueOcupa;
      
      if (espacioOcupado >= 4) {
        grupos.push(grupoActual);
        grupoActual = [];
        espacioOcupado = 0;
      }
    }
    
    if (grupoActual.length > 0) {
      grupos.push(grupoActual);
    }
    
    return grupos;
  }

  obtenerClaseGrupo(grupo: { url: string; esHorizontal: boolean }[]): string {
    if (grupo.length === 0) return '';
    
    const horizontales = grupo.filter(img => img.esHorizontal).length;
    const verticales = grupo.filter(img => !img.esHorizontal).length;
    
    if (grupo.length === 1) {
      return 'una-imagen';
    }
    
    if (horizontales === 0 && verticales === 2) {
      return 'dos-imagenes-verticales';
    }
    
    if (horizontales === 1 && verticales === 2) {
      return 'horizontal-mas-verticales';
    }
    
    if (horizontales === 2 && verticales === 0) {
      return 'dos-imagenes-horizontales';
    }
    
    if (horizontales === 0 && verticales === 3) {
      return 'tres-imagenes-verticales';
    }
    
    if (horizontales === 0 && verticales === 4) {
      return 'cuatro-imagenes-verticales';
    }
    
    return '';
  }

  debugGrupos(grupos: { url: string; esHorizontal: boolean }[][]): void {
    console.log('=== DEBUG GRUPOS ===');
    grupos.forEach((grupo, index) => {
      const horizontales = grupo.filter(img => img.esHorizontal).length;
      const verticales = grupo.filter(img => !img.esHorizontal).length;
      const espacioTotal = (horizontales * 2) + verticales;
      
      console.log(`Grupo ${index + 1}:`, {
        total: grupo.length,
        horizontales,
        verticales,
        espacioOcupado: espacioTotal,
        clase: this.obtenerClaseGrupo(grupo)
      });
    });
  }

  actualizarGrupos(categoria: string) {
    switch (categoria) {
      case 'antes':
        this.gruposAntes = this.dividirEnGrupos(this.imagenesAntes, 4);
        console.log('Grupos ANTES actualizados:');
        this.debugGrupos(this.gruposAntes);
        break;
      case 'durante':
        this.gruposDurante = this.dividirEnGrupos(this.imagenesDurante, 4);
        console.log('Grupos DURANTE actualizados:');
        this.debugGrupos(this.gruposDurante);
        break;
      case 'despues':
        this.gruposDespues = this.dividirEnGrupos(this.imagenesDespues, 4);
        console.log('Grupos DESPUES actualizados:');
        this.debugGrupos(this.gruposDespues);
        break;
      case 'albaran':
        this.gruposAlbaran = this.imagenesAlbaran.map(imagen => [imagen]);
        console.log('Grupos ALBARAN actualizados:');
        this.debugGrupos(this.gruposAlbaran);
        break;
    }
  }

  async generarPDF2(event: MouseEvent): Promise<void> {
    console.log('Inicio de generarPDF');
    event.preventDefault();
    this.cargandoPDF = true;
    const hojas = document.querySelectorAll('.hoja');
    const pdf = new jsPDF('p', 'mm', 'a4');

    for (let i = 0; i < hojas.length; i++) {
      await html2canvas(hojas[i] as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scale: 2, // Aumentamos la escala para mejor calidad
        width: 794, // Ancho específico para A4 (210mm * 96dpi / 25.4)
        height: 1123, // Alto específico para A4 (297mm * 96dpi / 25.4)
        scrollX: 0,
        scrollY: 0,
        windowWidth: 794,
        windowHeight: 1123,
        imageTimeout: 15000, // Timeout más largo para cargar imágenes
        logging: false,
        onclone: (clonedDoc) => {
          // Asegurar que las imágenes mantengan su aspect ratio en el clon
          const clonedImages = clonedDoc.querySelectorAll('.espacioIndvFoto img, .espacioIndvFotoHorizontal img, .espacioIndvFotoOpcion2 img');
          clonedImages.forEach((img: any) => {
            img.style.objectFit = 'contain';
            img.style.objectPosition = 'center';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.width = 'auto';
            img.style.height = 'auto';
          });
          
          // Asegurar que los contenedores mantengan sus dimensiones
          const contenedores = clonedDoc.querySelectorAll('.espacioIndvFoto, .espacioIndvFotoHorizontal, .espacioIndvFotoOpcion2');
          contenedores.forEach((contenedor: any) => {
            contenedor.style.overflow = 'hidden';
            contenedor.style.display = 'flex';
            contenedor.style.alignItems = 'center';
            contenedor.style.justifyContent = 'center';
          });
        }
      }).then((canvas) => {
        const imgData = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
        const imgBuffer = Buffer.from(imgData, 'base64');
        
        const imgWidth = 210;
        const imgHeight = 297; // Mantener proporciones A4

        if (i > 0) {
          pdf.addPage();
        }

        const uint8Array = new Uint8Array(imgBuffer);
        pdf.addImage(uint8Array, 'JPEG', 0, 0, imgWidth, imgHeight, '', 'FAST', 0);
      }).catch((error) => {
        console.error('Error al generar canvas:', error);
        this.toastr.error('Error al procesar la imagen de la página ' + (i + 1));
      });
    }

    let nombreArchivo = 'documento.pdf';

    if (this.datosOrden?.codocc) {
      nombreArchivo = `${this.datosOrden.codocc} Cierra.pdf`;
    } else if (this.datosOrden) {
      const datosIncompletos = !this.datosOrden.aviso || !this.datosOrden.tipoUnidad || !this.datosOrden.nombreEstacionEstaciones || !this.datosOrden.pueblo || !this.datosOrden.ciudad;

      if (datosIncompletos) {
        nombreArchivo = 'pdfgenerado.pdf';
      } else if (this.datosOrden.aviso) {
        nombreArchivo = `${this.datosOrden.aviso}${this.datosOrden.tipoUnidad}${this.datosOrden.nombreEstacionEstaciones}${this.datosOrden.pueblo}(${this.datosOrden.ciudad}).pdf`;
      } else {
        nombreArchivo = `${this.datosOrden.tipoUnidad}${this.datosOrden.nombreEstacionEstaciones}${this.datosOrden.pueblo}${this.datosOrden.ciudad}.pdf`;
      }
    }

    const pdfBuffer = pdf.output('arraybuffer');
    const rutaArchivo = `C:\\TEMP\\${nombreArchivo}`;

    fs.writeFile(rutaArchivo, Buffer.from(pdfBuffer), (err: Error | null) => {
      if (err) {
        console.error('Error al guardar el PDF:', err);
        this.toastr.error('Error al guardar el PDF');
        this.cargandoPDF = false;
      } else {
        console.log('PDF guardado con éxito en:', rutaArchivo);

        this.plantillaService.procesarPDF(rutaArchivo, this.rutaPref).subscribe({
          next: (respuesta) => {
            console.log('Respuesta del servidor:', respuesta);
            this.manejarRespuestaExitosa(respuesta);
            this.cargandoPDF = false;
          },
          error: (error) => {
            this.manejarError(error);
            this.cargandoPDF = false;
          },
        });
      }
    });
  }

  
  fotoEstrecha() {
    console.log('Accediendo a foto estrecha');
    
    if (this.claseFoto === 'espacioIndvFoto') {
      this.claseFoto = 'espacioIndvFotoOpcion2';
    } else {
      this.claseFoto = 'espacioIndvFoto';
    }
  }

  recargarApp() {
    console.log('Recargando APP');
    this.toastr.success('APP RECARGADA');
    this.router.navigate(['/visualizador']);
  }

  estilosBOS = {
    width: '10%',
    height: '100%'
  };
}