export class Datos {
    public estacion: string;
    public orden: string;
    public aviso: string;
    public direccion: string;
    public poblacion: string;
    public nombre: string;
    public tipo : string;
    public ciudad : string;
    public tipoUnidad : string

  
    constructor(
      estacion: string,
      orden: string,
      aviso: string,
      direccion: string,
      poblacion: string,
      nombre: string,
      tipo : string,
      ciudad : string,
      tipoUnidad : string

    ) {
      this.estacion = estacion;
      this.orden = orden;
      this.aviso = aviso;
      this.direccion = direccion;
      this.poblacion = poblacion;
      this.nombre = nombre;
      this.tipo = tipo
      this.ciudad = ciudad
      this.tipoUnidad = tipoUnidad

    }
  }
  
