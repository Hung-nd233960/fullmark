# Fourier transform properties

| Property | x(t) | X(ω) | Condition or note |
| --- | --- | --- | --- |
| Linearity | $a\,x(t) + b\,y(t)$ | $a\,X(\omega) + b\,Y(\omega)$ | a and b constants, both signals have transforms |
| Time shift | $x(t - t_0)$ | $e^{-j\omega t_0} X(\omega)$ | any real shift t0 |
| Frequency shift | $e^{j\omega_0 t} x(t)$ | $X(\omega - \omega_0)$ | any real shift omega0 |
| Scaling | $x(at)$ | $\frac{1}{\lvert a\rvert} X(\omega / a)$ | a is real and not zero |
| Convolution | $x(t) * y(t)$ | $X(\omega)\,Y(\omega)$ | both signals absolutely integrable |
| Multiplication | $x(t)\,y(t)$ | $\frac{1}{2\pi} X(\omega) * Y(\omega)$ | dual of convolution in time |

Parseval: $\int \lvert x(t)\rvert^2 dt = \frac{1}{2\pi} \int \lvert X(\omega)\rvert^2 d\omega$.

$\mathrm{sinc}(x) = \sin(\pi x) / (\pi x)$, so sinc(0) = 1.
